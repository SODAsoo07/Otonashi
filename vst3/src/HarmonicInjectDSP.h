#pragma once

#include <array>
#include <cmath>

#include <JuceHeader.h>

#include "LiveAssist.h"
#include "OtonashiTypes.h"

namespace otonashi
{
class HarmonicInjectDSP
{
public:
    struct Snapshot
    {
        PitchSourceMode pitchSource = PitchSourceMode::autoDetect;
        SubharmonicMode subMode = SubharmonicMode::half;
        QualityMode quality = QualityMode::normal;
        float manualPitchHz = 220.0f;
        float envelopePitchHz = 220.0f;
        float pitchFollow = 1.0f;
        float subAmount = 0.0f;
        float harmonicAmount = 0.0f;
        int harmonicCount = 4;
        float oddEvenBias = 0.0f;
        float spectralTiltDbPerOct = -3.0f;
        float inharmonicity = 0.0f;
        float breathPreserve = 0.7f;
        float formantFollow = 0.8f;
        float tractBrightness = 1.0f;
        LiveAssistState liveAssist;
    };

    void prepare (double newSampleRate, int maxBlockSize)
    {
        sampleRate = juce::jmax (1.0, newSampleRate);
        oversampler2x.reset();
        oversampler4x.reset();
        const auto blockSize = static_cast<size_t> (juce::jmax (1, maxBlockSize));
        oversampler2x.initProcessing (blockSize);
        oversampler4x.initProcessing (blockSize);
        reset();
    }

    void reset()
    {
        halfPhase = 0.0;
        thirdPhase = 0.0;
        harmonicPhases.fill (0.0);
        envelopeFollower = 0.0f;
        dcBlock.reset();
        antiAlias.reset();
        oversampler2x.reset();
        oversampler4x.reset();
        updateFilters (currentQuality, sampleRate);
    }

    void process (juce::AudioBuffer<float>& buffer, const Snapshot& snapshot)
    {
        if (buffer.getNumChannels() == 0)
            return;

        juce::dsp::AudioBlock<float> block (buffer);

        switch (snapshot.quality)
        {
            case QualityMode::eco:
            {
                updateFilters (snapshot.quality, sampleRate);
                processBlock (block, snapshot, sampleRate);
                break;
            }
            case QualityMode::hq:
            {
                updateFilters (snapshot.quality, sampleRate * 4.0);
                auto oversampled = oversampler4x.processSamplesUp (block);
                processBlock (oversampled, snapshot, sampleRate * 4.0);
                oversampler4x.processSamplesDown (block);
                break;
            }
            case QualityMode::normal:
            default:
            {
                updateFilters (snapshot.quality, sampleRate * 2.0);
                auto oversampled = oversampler2x.processSamplesUp (block);
                processBlock (oversampled, snapshot, sampleRate * 2.0);
                oversampler2x.processSamplesDown (block);
                break;
            }
        }
    }

private:
    static void advancePhase (double& phase, float frequency, float sampleRate) noexcept
    {
        phase += juce::MathConstants<double>::twoPi * static_cast<double> (frequency) / static_cast<double> (sampleRate);
        if (phase >= juce::MathConstants<double>::twoPi)
            phase -= juce::MathConstants<double>::twoPi;
    }

    float resolvePitch (const Snapshot& snapshot) const noexcept
    {
        switch (snapshot.pitchSource)
        {
            case PitchSourceMode::manual:
                return snapshot.manualPitchHz;

            case PitchSourceMode::envelope:
                return juce::jmap (juce::jlimit (0.0f, 1.0f, snapshot.pitchFollow), snapshot.manualPitchHz, snapshot.envelopePitchHz > 0.0f ? snapshot.envelopePitchHz : snapshot.manualPitchHz);

            case PitchSourceMode::autoDetect:
            default:
                return juce::jmap (juce::jlimit (0.0f, 1.0f, snapshot.pitchFollow), snapshot.manualPitchHz, snapshot.liveAssist.f0Hz > 0.0f ? snapshot.liveAssist.f0Hz : snapshot.manualPitchHz);
        }
    }

    int getCappedHarmonicCount (const Snapshot& snapshot) const noexcept
    {
        switch (snapshot.quality)
        {
            case QualityMode::eco: return juce::jmin (snapshot.harmonicCount, 4);
            case QualityMode::hq: return juce::jmin (snapshot.harmonicCount, 8);
            case QualityMode::normal:
            default: return juce::jmin (snapshot.harmonicCount, 6);
        }
    }

    void processBlock (juce::dsp::AudioBlock<float> block, const Snapshot& snapshot, double effectiveSampleRate)
    {
        auto* data = block.getChannelPointer (0);
        const auto numSamples = static_cast<int> (block.getNumSamples());
        const auto resolvedPitch = juce::jlimit (50.0f, 600.0f, resolvePitch (snapshot));
        const auto baseVoicedWeight = juce::jmap (juce::jlimit (0.0f, 1.0f, snapshot.breathPreserve), 1.0f, juce::jlimit (0.0f, 1.0f, snapshot.liveAssist.voicedProb));
        const auto brightness = juce::jlimit (0.5f, 1.5f, snapshot.tractBrightness * juce::jmap (snapshot.formantFollow, 0.0f, 1.0f, 1.0f, 1.15f));
        const auto sampleRateF = static_cast<float> (effectiveSampleRate);
        const auto halfWeight = snapshot.subMode == SubharmonicMode::half ? 1.0f : (snapshot.subMode == SubharmonicMode::blend ? 0.65f : 0.0f);
        const auto thirdWeight = snapshot.subMode == SubharmonicMode::third ? 1.0f : (snapshot.subMode == SubharmonicMode::blend ? 0.35f : 0.0f);
        const auto envCoeff = static_cast<float> (std::exp (-1.0f / (0.02f * sampleRateF)));

        for (int i = 0; i < numSamples; ++i)
        {
            const auto input = data[i];
            envelopeFollower = envelopeFollower * envCoeff + std::abs (input) * (1.0f - envCoeff);
            const auto voicedWeight = juce::jlimit (0.0f, 1.0f, baseVoicedWeight + snapshot.liveAssist.confidence * 0.15f);

            float subSignal = 0.0f;
            if (snapshot.subAmount > 0.0f)
            {
                advancePhase (halfPhase, resolvedPitch * 0.5f, sampleRateF);
                advancePhase (thirdPhase, resolvedPitch / 3.0f, sampleRateF);
                subSignal = std::sin (halfPhase) * halfWeight + std::sin (thirdPhase) * thirdWeight;
            }

            float harmonicSignal = 0.0f;
            const auto cappedCount = getCappedHarmonicCount (snapshot);
            for (int harmonicIndex = 0; harmonicIndex < cappedCount; ++harmonicIndex)
            {
                const auto partialNumber = harmonicIndex + 2;
                const auto partialRatio = static_cast<float> (partialNumber) + snapshot.inharmonicity * 0.1f * static_cast<float> (partialNumber * partialNumber);
                const auto partialFreq = resolvedPitch * partialRatio;

                if (partialFreq >= sampleRateF * 0.45f)
                    continue;

                advancePhase (harmonicPhases[static_cast<size_t> (harmonicIndex)], partialFreq, sampleRateF);

                const auto isOdd = (partialNumber % 2) != 0;
                const auto parityWeight = isOdd
                                              ? juce::jmap (snapshot.oddEvenBias, -1.0f, 1.0f, 0.6f, 1.4f)
                                              : juce::jmap (snapshot.oddEvenBias, -1.0f, 1.0f, 1.4f, 0.6f);
                const auto tiltGain = juce::Decibels::decibelsToGain (snapshot.spectralTiltDbPerOct * std::log2 (static_cast<double> (partialNumber)));
                harmonicSignal += std::sin (harmonicPhases[static_cast<size_t> (harmonicIndex)]) * parityWeight * static_cast<float> (tiltGain);
            }

            const auto generated = ((subSignal * snapshot.subAmount) + (harmonicSignal * snapshot.harmonicAmount))
                                 * voicedWeight
                                 * (0.2f + envelopeFollower * 1.6f)
                                 * brightness;

            auto injected = dcBlock.processSingleSampleRaw (generated);
            injected = antiAlias.processSingleSampleRaw (injected);
            data[i] = input + injected;
        }
    }

    void updateFilters (QualityMode quality, double effectiveSampleRate)
    {
        if (quality == currentQuality && effectiveSampleRate == filterSampleRate)
            return;

        currentQuality = quality;
        filterSampleRate = effectiveSampleRate;
        dcBlock.setCoefficients (juce::IIRCoefficients::makeHighPass (filterSampleRate, 30.0));

        switch (quality)
        {
            case QualityMode::eco:
                antiAlias.setCoefficients (juce::IIRCoefficients::makeLowPass (filterSampleRate, 11000.0));
                break;

            case QualityMode::hq:
                antiAlias.setCoefficients (juce::IIRCoefficients::makeLowPass (filterSampleRate, 18000.0));
                break;

            case QualityMode::normal:
            default:
                antiAlias.setCoefficients (juce::IIRCoefficients::makeLowPass (filterSampleRate, 15000.0));
                break;
        }
    }

    double sampleRate = 44100.0;
    double filterSampleRate = 44100.0;
    double halfPhase = 0.0;
    double thirdPhase = 0.0;
    std::array<double, 8> harmonicPhases {};
    float envelopeFollower = 0.0f;
    juce::IIRFilter dcBlock;
    juce::IIRFilter antiAlias;
    QualityMode currentQuality = QualityMode::normal;
    juce::dsp::Oversampling<float> oversampler2x { 1, 1, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, false, true };
    juce::dsp::Oversampling<float> oversampler4x { 1, 2, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, false, true };
};
} // namespace otonashi
