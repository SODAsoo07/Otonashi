#pragma once

#include <atomic>
#include <thread>

#include <JuceHeader.h>

#include "AnalysisEngine.h"
#include "EnvelopeState.h"
#include "HarmonicInjectDSP.h"
#include "InputHistoryBuffer.h"
#include "LiveAssist.h"
#include "TractDSP.h"

namespace otonashi
{
namespace ParamIDs
{
inline constexpr auto wet = "mix.wet";
inline constexpr auto output = "mix.output";
inline constexpr auto tongueX = "tract.tongueX";
inline constexpr auto tongueY = "tract.tongueY";
inline constexpr auto lips = "tract.lips";
inline constexpr auto lipLen = "tract.lipLen";
inline constexpr auto throat = "tract.throat";
inline constexpr auto nasal = "tract.nasal";
inline constexpr auto breath = "tract.breath";
inline constexpr auto gender = "tract.gender";
inline constexpr auto intensity = "tract.intensity";
inline constexpr auto pitchSource = "pitch.source";
inline constexpr auto manualPitchHz = "pitch.manualHz";
inline constexpr auto pitchFollow = "pitch.follow";
inline constexpr auto subAmount = "harm.subAmount";
inline constexpr auto subMode = "harm.subMode";
inline constexpr auto harmonicAmount = "harm.harmAmount";
inline constexpr auto harmonicCount = "harm.count";
inline constexpr auto oddEvenBias = "harm.oddEven";
inline constexpr auto spectralTilt = "harm.tilt";
inline constexpr auto inharmonicity = "harm.inharm";
inline constexpr auto breathPreserve = "harm.breathPreserve";
inline constexpr auto formantFollow = "harm.formantFollow";
inline constexpr auto quality = "global.quality";
inline constexpr auto analysisSensitivity = "analysis.sensitivity";
inline constexpr auto analysisSmoothing = "analysis.smoothing";
inline constexpr auto analysisApplyBlend = "analysis.applyBlend";
inline constexpr auto analysisConsonants = "analysis.consonants";
inline constexpr auto analysisLanguage = "analysis.lang";
inline constexpr auto analysisUseLanes = "analysis.useLanes";
}

class OtonashiTractAudioProcessor final : public juce::AudioProcessor,
                                          public juce::ChangeBroadcaster,
                                          private juce::AsyncUpdater
{
public:
    OtonashiTractAudioProcessor();
    ~OtonashiTractAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;
    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState& getValueTreeState() noexcept { return parameters; }
    AnalysisConfig getAnalysisConfig() const;
    void updateAnalysisConfig (const AnalysisConfig& config);
    AnalysisResult getLastAnalysisResult() const;
    EnvelopeState getEnvelopeState() const;
    struct EnvelopeSummary
    {
        int laneCount = 0;
        double durationSeconds = 0.0;
    };
    EnvelopeSummary getEnvelopeSummary() const;
    LiveAssistState getLiveAssistState() const noexcept;
    TractFrame getCurrentTractFrame() const;
    std::array<float, 3> getCurrentFormants() const;
    bool isAnalysisBusy() const noexcept;
    bool startAnalysisOfRecentInput();
    void applyLastAnalysis();
    void resetAnalysis();
    double getCapturedHistorySeconds() const noexcept;

private:
    void handleAsyncUpdate() override;

    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    float getFloatParam (const juce::String& id) const;
    int getChoiceParam (const juce::String& id) const;
    TractFrame buildResolvedTractFrame() const;
    HarmonicInjectDSP::Snapshot buildHarmonicSnapshot (const TractFrame& frame, const LiveAssistState& liveState) const;
    void joinAnalysisThreadIfNeeded();

    juce::AudioProcessorValueTreeState parameters;
    mutable juce::CriticalSection stateLock;
    mutable juce::SpinLock runtimeLock;
    mutable juce::SpinLock envelopeLock;

    AnalysisConfig analysisConfig;
    AnalysisResult lastAnalysis;
    AnalysisResult pendingAnalysis;
    EnvelopeState internalEnvelopes;
    TractFrame lastResolvedFrame;
    std::array<float, 3> lastFormants { 500.0f, 1500.0f, 2500.0f };

    InputHistoryBuffer inputHistory;
    LiveAssistDetector liveAssist;
    HarmonicInjectDSP harmonicInject;
    TractDSP tractProcessor;
    juce::dsp::Limiter<float> limiter;
    juce::AudioBuffer<float> wetBuffer;

    std::thread analysisThread;
    std::atomic<bool> analysisBusy { false };
    bool hasPendingAnalysis = false;
    std::atomic<double> analysisPlaybackTimeSeconds { 0.0 };
};
} // namespace otonashi
