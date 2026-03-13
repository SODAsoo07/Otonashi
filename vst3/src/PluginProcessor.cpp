#include "PluginProcessor.h"

#include "PluginEditor.h"

namespace otonashi
{
namespace
{
constexpr auto stateRootId = "OtonashiTractState";
constexpr auto envelopeId = "EnvelopeState";
constexpr auto analysisConfigId = "AnalysisConfig";

bool isMono (const juce::AudioChannelSet& layout)
{
    return layout == juce::AudioChannelSet::mono();
}
} // namespace

OtonashiTractAudioProcessor::OtonashiTractAudioProcessor()
    : juce::AudioProcessor (BusesProperties()
                                .withInput ("Input", juce::AudioChannelSet::mono(), true)
                                .withOutput ("Output", juce::AudioChannelSet::mono(), true)),
      parameters (*this, nullptr, "PARAMETERS", createParameterLayout())
{
}

OtonashiTractAudioProcessor::~OtonashiTractAudioProcessor()
{
    joinAnalysisThreadIfNeeded();
}

const juce::String OtonashiTractAudioProcessor::getName() const
{
    return "OTONASHI Tract";
}

bool OtonashiTractAudioProcessor::acceptsMidi() const { return false; }
bool OtonashiTractAudioProcessor::producesMidi() const { return false; }
bool OtonashiTractAudioProcessor::isMidiEffect() const { return false; }
double OtonashiTractAudioProcessor::getTailLengthSeconds() const { return 0.0; }

int OtonashiTractAudioProcessor::getNumPrograms() { return 1; }
int OtonashiTractAudioProcessor::getCurrentProgram() { return 0; }
void OtonashiTractAudioProcessor::setCurrentProgram (int) {}
const juce::String OtonashiTractAudioProcessor::getProgramName (int) { return {}; }
void OtonashiTractAudioProcessor::changeProgramName (int, const juce::String&) {}

void OtonashiTractAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    inputHistory.prepare (sampleRate, 10);
    liveAssist.prepare (sampleRate);
    harmonicInject.prepare (sampleRate, samplesPerBlock);
    tractProcessor.prepare (sampleRate);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32> (samplesPerBlock);
    spec.numChannels = 1;
    limiter.prepare (spec);
    limiter.setRelease (0.05f);

    wetBuffer.setSize (1, samplesPerBlock);
    analysisPlaybackTimeSeconds.store (0.0);
}

void OtonashiTractAudioProcessor::releaseResources()
{
    joinAnalysisThreadIfNeeded();
    wetBuffer.setSize (1, 0);
}

bool OtonashiTractAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    if (! isMono (layouts.getMainInputChannelSet()))
        return false;

    if (! isMono (layouts.getMainOutputChannelSet()))
        return false;

    return true;
}

void OtonashiTractAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    const auto numSamples = buffer.getNumSamples();
    const auto numChannels = buffer.getNumChannels();
    if (numSamples == 0 || numChannels == 0)
        return;

    if (numChannels > 1)
    {
        auto* mono = buffer.getWritePointer (0);
        for (int sample = 0; sample < numSamples; ++sample)
        {
            float sum = 0.0f;
            for (int ch = 0; ch < numChannels; ++ch)
                sum += buffer.getReadPointer (ch)[sample];
            mono[sample] = sum / static_cast<float> (numChannels);
        }

        for (int ch = 1; ch < numChannels; ++ch)
            buffer.clear (ch, 0, numSamples);
    }

    auto* monoData = buffer.getWritePointer (0);
    inputHistory.push (monoData, numSamples);
    liveAssist.pushSamples (monoData, numSamples);

    wetBuffer.makeCopyOf (buffer, true);

    const auto liveState = liveAssist.getState();
    const auto tractFrame = buildResolvedTractFrame();
    const auto snapshot = buildHarmonicSnapshot (tractFrame, liveState);

    harmonicInject.process (wetBuffer, snapshot);
    tractProcessor.process (wetBuffer, tractFrame);

    {
        const juce::SpinLock::ScopedLockType lock (runtimeLock);
        lastResolvedFrame = tractFrame;
        lastFormants = tractProcessor.getCurrentFormants();
    }

    const auto wetMix = juce::jlimit (0.0f, 1.0f, getFloatParam (ParamIDs::wet));
    const auto outputDb = getFloatParam (ParamIDs::output);
    const auto outputGain = juce::Decibels::decibelsToGain (outputDb);

    auto* wetData = wetBuffer.getReadPointer (0);
    for (int i = 0; i < numSamples; ++i)
        monoData[i] = (monoData[i] * (1.0f - wetMix) + wetData[i] * wetMix) * outputGain;

    juce::dsp::AudioBlock<float> block (buffer);
    juce::dsp::ProcessContextReplacing<float> context (block);
    limiter.process (context);

    const auto useLanes = getChoiceParam (ParamIDs::analysisUseLanes) > 0;
    if (useLanes)
    {
        const juce::SpinLock::ScopedTryLockType lock (envelopeLock);
        if (lock.isLocked())
        {
            const auto duration = internalEnvelopes.getDurationSeconds();
            if (duration > 0.0)
            {
                auto current = analysisPlaybackTimeSeconds.load();
                current += static_cast<double> (numSamples) / getSampleRate();
                analysisPlaybackTimeSeconds.store (juce::jmin (current, duration));
            }
        }
    }
}

juce::AudioProcessorEditor* OtonashiTractAudioProcessor::createEditor()
{
    return new OtonashiTractAudioProcessorEditor (*this);
}

bool OtonashiTractAudioProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorValueTreeState::ParameterLayout OtonashiTractAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::wet, "Dry/Wet", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 1.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::output, "Output Gain", juce::NormalisableRange<float> (-18.0f, 12.0f, 0.1f), 0.0f));

    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::tongueX, "Tongue X", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.5f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::tongueY, "Tongue Y", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.4f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::lips, "Lips", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.7f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::lipLen, "Lip Length", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.5f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::throat, "Throat", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.5f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::nasal, "Nasal", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.2f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::breath, "Breath", juce::NormalisableRange<float> (0.0f, 0.3f, 0.001f), 0.01f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::gender, "Gender", juce::NormalisableRange<float> (0.5f, 2.0f, 0.001f), 1.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::intensity, "Intensity", juce::NormalisableRange<float> (0.0f, 1.5f, 0.001f), 1.0f));

    layout.add (std::make_unique<juce::AudioParameterChoice> (ParamIDs::pitchSource, "Pitch Source", juce::StringArray { "Auto", "Manual", "Envelope" }, 0));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::manualPitchHz, "Manual Pitch", juce::NormalisableRange<float> (50.0f, 600.0f, 0.1f), 220.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::pitchFollow, "Pitch Follow", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 1.0f));

    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::subAmount, "Sub Amount", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.0f));
    layout.add (std::make_unique<juce::AudioParameterChoice> (ParamIDs::subMode, "Sub Mode", juce::StringArray { "Half", "Third", "Blend" }, 0));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::harmonicAmount, "Harmonic Amount", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.0f));
    layout.add (std::make_unique<juce::AudioParameterInt> (ParamIDs::harmonicCount, "Harmonic Count", 1, 8, 4));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::oddEvenBias, "Odd/Even Bias", juce::NormalisableRange<float> (-1.0f, 1.0f, 0.001f), 0.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::spectralTilt, "Spectral Tilt", juce::NormalisableRange<float> (-12.0f, 12.0f, 0.1f), -3.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::inharmonicity, "Inharmonicity", juce::NormalisableRange<float> (0.0f, 0.15f, 0.001f), 0.0f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::breathPreserve, "Breath Preserve", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.7f));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::formantFollow, "Formant Follow", juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.8f));
    layout.add (std::make_unique<juce::AudioParameterChoice> (ParamIDs::quality, "Quality", juce::StringArray { "Eco", "Normal", "HQ" }, 1));

    auto analysisFloat = juce::AudioParameterFloatAttributes().withAutomatable (false);
    auto analysisChoice = juce::AudioParameterChoiceAttributes().withAutomatable (false);
    auto analysisBool = juce::AudioParameterBoolAttributes().withAutomatable (false);

    layout.add (std::make_unique<juce::AudioParameterChoice> (ParamIDs::analysisLanguage, "Analysis Language",
                                                              juce::StringArray { "JP", "KR", "EN" }, 0, analysisChoice));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::analysisSensitivity, "Analysis Sensitivity",
                                                             juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.6f, analysisFloat));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::analysisSmoothing, "Analysis Smoothing",
                                                             juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 0.55f, analysisFloat));
    layout.add (std::make_unique<juce::AudioParameterFloat> (ParamIDs::analysisApplyBlend, "Analysis Apply Blend",
                                                             juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f), 1.0f, analysisFloat));
    layout.add (std::make_unique<juce::AudioParameterBool> (ParamIDs::analysisConsonants, "Detect Consonants", true, analysisBool));
    layout.add (std::make_unique<juce::AudioParameterBool> (ParamIDs::analysisUseLanes, "Use Envelopes", true, analysisBool));

    return layout;
}

float OtonashiTractAudioProcessor::getFloatParam (const juce::String& id) const
{
    if (auto* param = parameters.getRawParameterValue (id))
        return param->load();
    return 0.0f;
}

int OtonashiTractAudioProcessor::getChoiceParam (const juce::String& id) const
{
    return static_cast<int> (std::round (getFloatParam (id)));
}

AnalysisConfig OtonashiTractAudioProcessor::getAnalysisConfig() const
{
    AnalysisConfig config;
    config.language = static_cast<LanguageMode> (getChoiceParam (ParamIDs::analysisLanguage));
    config.sensitivity = getFloatParam (ParamIDs::analysisSensitivity);
    config.smoothing = getFloatParam (ParamIDs::analysisSmoothing);
    config.applyBlend = getFloatParam (ParamIDs::analysisApplyBlend);
    config.detectConsonants = getChoiceParam (ParamIDs::analysisConsonants) > 0;
    config.useLanes = getChoiceParam (ParamIDs::analysisUseLanes) > 0;
    config.quality = static_cast<QualityMode> (getChoiceParam (ParamIDs::quality));
    return config;
}

void OtonashiTractAudioProcessor::updateAnalysisConfig (const AnalysisConfig& config)
{
    juce::ScopedLock lock (stateLock);
    analysisConfig = config;
}

AnalysisResult OtonashiTractAudioProcessor::getLastAnalysisResult() const
{
    juce::ScopedLock lock (stateLock);
    return lastAnalysis;
}

EnvelopeState OtonashiTractAudioProcessor::getEnvelopeState() const
{
    const juce::SpinLock::ScopedLockType lock (envelopeLock);
    return internalEnvelopes;
}

OtonashiTractAudioProcessor::EnvelopeSummary OtonashiTractAudioProcessor::getEnvelopeSummary() const
{
    const juce::SpinLock::ScopedLockType lock (envelopeLock);
    return { internalEnvelopes.getLaneCount(), internalEnvelopes.getDurationSeconds() };
}

LiveAssistState OtonashiTractAudioProcessor::getLiveAssistState() const noexcept
{
    return liveAssist.getState();
}

TractFrame OtonashiTractAudioProcessor::getCurrentTractFrame() const
{
    const juce::SpinLock::ScopedLockType lock (runtimeLock);
    return lastResolvedFrame;
}

std::array<float, 3> OtonashiTractAudioProcessor::getCurrentFormants() const
{
    const juce::SpinLock::ScopedLockType lock (runtimeLock);
    return lastFormants;
}

bool OtonashiTractAudioProcessor::isAnalysisBusy() const noexcept
{
    return analysisBusy.load();
}

bool OtonashiTractAudioProcessor::startAnalysisOfRecentInput()
{
    if (analysisBusy.exchange (true))
        return false;

    joinAnalysisThreadIfNeeded();

    if (inputHistory.getAvailableDurationSeconds() < 0.1)
    {
        analysisBusy.store (false);
        return false;
    }

    const auto config = getAnalysisConfig();
    const auto snapshot = inputHistory.copyLatestWindow (7.0);
    const auto sampleRate = getSampleRate();

    analysisThread = std::thread ([this, snapshot, config, sampleRate]()
    {
        const auto result = AnalysisEngine::analyze (snapshot, sampleRate, config);
        {
            juce::ScopedLock lock (stateLock);
            pendingAnalysis = result;
            hasPendingAnalysis = true;
            analysisConfig = config;
        }

        analysisBusy.store (false);
        triggerAsyncUpdate();
    });

    return true;
}

void OtonashiTractAudioProcessor::applyLastAnalysis()
{
    juce::ScopedLock stateGuard (stateLock);
    if (! lastAnalysis.isValid())
        return;

    const auto blend = juce::jlimit (0.0f, 1.0f, getFloatParam (ParamIDs::analysisApplyBlend));
    const juce::SpinLock::ScopedLockType envelopeGuard (envelopeLock);

    for (const auto& lane : lastAnalysis.suggestedLanes)
    {
        EnvelopeLane blended = lane;
        const auto* existing = internalEnvelopes.getLane (lane.id);
        const float fallback = [&]()
        {
            if (lane.id == "tongueX") return getFloatParam (ParamIDs::tongueX);
            if (lane.id == "tongueY") return getFloatParam (ParamIDs::tongueY);
            if (lane.id == "lips") return getFloatParam (ParamIDs::lips);
            if (lane.id == "lipLen") return getFloatParam (ParamIDs::lipLen);
            if (lane.id == "throat") return getFloatParam (ParamIDs::throat);
            if (lane.id == "nasal") return getFloatParam (ParamIDs::nasal);
            if (lane.id == "breath") return getFloatParam (ParamIDs::breath);
            if (lane.id == "gender") return getFloatParam (ParamIDs::gender);
            if (lane.id == "pitch") return getFloatParam (ParamIDs::manualPitchHz);
            return 0.0f;
        }();

        for (auto& point : blended.points)
        {
            const auto base = existing ? existing->evaluate (point.tSeconds) : fallback;
            point.value = juce::jmap (blend, base, point.value);
        }

        internalEnvelopes.setLane (blended);
    }

    analysisPlaybackTimeSeconds.store (0.0);
}

void OtonashiTractAudioProcessor::resetAnalysis()
{
    juce::ScopedLock lock (stateLock);
    {
        const juce::SpinLock::ScopedLockType envelopeGuard (envelopeLock);
        internalEnvelopes.clear();
    }
    lastAnalysis = {};
    analysisPlaybackTimeSeconds.store (0.0);
}

double OtonashiTractAudioProcessor::getCapturedHistorySeconds() const noexcept
{
    return inputHistory.getAvailableDurationSeconds();
}

void OtonashiTractAudioProcessor::handleAsyncUpdate()
{
    juce::ScopedLock lock (stateLock);
    if (hasPendingAnalysis)
    {
        lastAnalysis = pendingAnalysis;
        pendingAnalysis = {};
        hasPendingAnalysis = false;
    }

    sendChangeMessage();
}

TractFrame OtonashiTractAudioProcessor::buildResolvedTractFrame() const
{
    TractFrame frame;
    frame.tongueX = getFloatParam (ParamIDs::tongueX);
    frame.tongueY = getFloatParam (ParamIDs::tongueY);
    frame.lips = getFloatParam (ParamIDs::lips);
    frame.lipLen = getFloatParam (ParamIDs::lipLen);
    frame.throat = getFloatParam (ParamIDs::throat);
    frame.nasal = getFloatParam (ParamIDs::nasal);
    frame.breath = getFloatParam (ParamIDs::breath);
    frame.gender = getFloatParam (ParamIDs::gender);
    frame.intensity = getFloatParam (ParamIDs::intensity);
    frame.pitchHz = getFloatParam (ParamIDs::manualPitchHz);

    const auto useLanes = getChoiceParam (ParamIDs::analysisUseLanes) > 0;
    if (useLanes)
    {
        const juce::SpinLock::ScopedTryLockType lock (envelopeLock);
        if (lock.isLocked() && ! internalEnvelopes.isEmpty())
        {
            const auto t = analysisPlaybackTimeSeconds.load();
            frame.tongueX = internalEnvelopes.evaluate ("tongueX", t, frame.tongueX);
            frame.tongueY = internalEnvelopes.evaluate ("tongueY", t, frame.tongueY);
            frame.lips = internalEnvelopes.evaluate ("lips", t, frame.lips);
            frame.lipLen = internalEnvelopes.evaluate ("lipLen", t, frame.lipLen);
            frame.throat = internalEnvelopes.evaluate ("throat", t, frame.throat);
            frame.nasal = internalEnvelopes.evaluate ("nasal", t, frame.nasal);
            frame.breath = internalEnvelopes.evaluate ("breath", t, frame.breath);
            frame.gender = internalEnvelopes.evaluate ("gender", t, frame.gender);
            frame.pitchHz = internalEnvelopes.evaluate ("pitch", t, frame.pitchHz);
            frame.voicedProb = internalEnvelopes.evaluate ("voiced", t, frame.voicedProb);
        }
    }

    return frame;
}

HarmonicInjectDSP::Snapshot OtonashiTractAudioProcessor::buildHarmonicSnapshot (const TractFrame& frame, const LiveAssistState& liveState) const
{
    HarmonicInjectDSP::Snapshot snapshot;
    snapshot.pitchSource = static_cast<PitchSourceMode> (getChoiceParam (ParamIDs::pitchSource));
    snapshot.subMode = static_cast<SubharmonicMode> (getChoiceParam (ParamIDs::subMode));
    snapshot.quality = static_cast<QualityMode> (getChoiceParam (ParamIDs::quality));
    snapshot.manualPitchHz = frame.pitchHz;
    const auto useLanes = getChoiceParam (ParamIDs::analysisUseLanes) > 0;
    if (useLanes)
    {
        const juce::SpinLock::ScopedTryLockType lock (envelopeLock);
        if (lock.isLocked())
            snapshot.envelopePitchHz = internalEnvelopes.evaluate ("pitch", analysisPlaybackTimeSeconds.load(), frame.pitchHz);
        else
            snapshot.envelopePitchHz = frame.pitchHz;
    }
    else
    {
        snapshot.envelopePitchHz = frame.pitchHz;
    }
    snapshot.pitchFollow = getFloatParam (ParamIDs::pitchFollow);
    snapshot.subAmount = getFloatParam (ParamIDs::subAmount);
    snapshot.harmonicAmount = getFloatParam (ParamIDs::harmonicAmount);
    snapshot.harmonicCount = static_cast<int> (std::round (getFloatParam (ParamIDs::harmonicCount)));
    snapshot.oddEvenBias = getFloatParam (ParamIDs::oddEvenBias);
    snapshot.spectralTiltDbPerOct = getFloatParam (ParamIDs::spectralTilt);
    snapshot.inharmonicity = getFloatParam (ParamIDs::inharmonicity);
    snapshot.breathPreserve = getFloatParam (ParamIDs::breathPreserve);
    snapshot.formantFollow = getFloatParam (ParamIDs::formantFollow);
    snapshot.tractBrightness = juce::jmap (frame.intensity, 0.0f, 1.5f, 0.9f, 1.15f);
    snapshot.liveAssist = liveState;
    return snapshot;
}

void OtonashiTractAudioProcessor::joinAnalysisThreadIfNeeded()
{
    if (analysisThread.joinable())
        analysisThread.join();
}

void OtonashiTractAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    juce::ValueTree root (stateRootId);
    root.addChild (parameters.copyState(), -1, nullptr);

    {
        juce::ScopedLock lock (stateLock);
        analysisConfig = getAnalysisConfig();
        const juce::SpinLock::ScopedLockType envelopeGuard (envelopeLock);
        root.addChild (internalEnvelopes.toValueTree(), -1, nullptr);
        root.addChild (analysisConfig.toValueTree(), -1, nullptr);
    }

    if (auto xml = root.createXml())
        copyXmlToBinary (*xml, destData);
}

void OtonashiTractAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xmlState = getXmlFromBinary (data, sizeInBytes))
    {
        const auto root = juce::ValueTree::fromXml (*xmlState);
        if (! root.isValid())
            return;

        if (auto paramsTree = root.getChild (0))
            parameters.replaceState (paramsTree);

        juce::ScopedLock lock (stateLock);
        if (auto envelopeTree = root.getChildWithName (envelopeId))
        {
            const juce::SpinLock::ScopedLockType envelopeGuard (envelopeLock);
            internalEnvelopes = EnvelopeState::fromValueTree (envelopeTree);
        }

        if (auto analysisTree = root.getChildWithName (analysisConfigId))
            analysisConfig = AnalysisConfig::fromValueTree (analysisTree);
        else
            analysisConfig = getAnalysisConfig();
    }
}

} // namespace otonashi

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new otonashi::OtonashiTractAudioProcessor();
}
