#pragma once

#include <array>

#include <JuceHeader.h>

#include "OtonashiTypes.h"

namespace otonashi
{
class TractDSP
{
public:
    void prepare (double newSampleRate)
    {
        sampleRate = juce::jmax (1.0, newSampleRate);
        reset();
    }

    void reset()
    {
        f1.reset();
        f2.reset();
        f3.reset();
        nasal.reset();
        dcBlock.reset();
        lastFormants = { 500.0f, 1500.0f, 2500.0f };
    }

    void process (juce::AudioBuffer<float>& buffer, const TractFrame& frame)
    {
        updateCoefficients (frame);

        auto* data = buffer.getWritePointer (0);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
        {
            const auto breathNoise = (random.nextFloat() * 2.0f - 1.0f) * frame.breath * 0.15f;
            auto sample = data[i] + breathNoise;
            sample = f1.processSingleSampleRaw (sample);
            sample = f2.processSingleSampleRaw (sample);
            sample = f3.processSingleSampleRaw (sample);

            const auto nasalSample = nasal.processSingleSampleRaw (sample);
            sample = juce::jmap (juce::jlimit (0.0f, 1.0f, frame.nasal), sample, nasalSample);
            sample = dcBlock.processSingleSampleRaw (sample);
            data[i] = sample;
        }
    }

    std::array<float, 3> getCurrentFormants() const noexcept
    {
        return lastFormants;
    }

private:
    void updateCoefficients (const TractFrame& frame)
    {
        const auto lipLengthScale = 1.0f - frame.lipLen * 0.3f;
        const auto lipOpenScale = 0.5f + frame.lips * 0.5f;
        const auto gender = juce::jlimit (0.5f, 2.0f, frame.gender);
        const auto intensity = juce::jlimit (0.0f, 1.5f, frame.intensity);

        const auto f1Freq = juce::jmax (50.0f, (200.0f + (1.0f - frame.tongueY) * 600.0f - frame.throat * 50.0f) * lipLengthScale * lipOpenScale * gender);
        const auto f2Freq = juce::jmax (120.0f, (800.0f + frame.tongueX * 1400.0f) * lipLengthScale * lipOpenScale * gender);
        const auto f3Freq = juce::jmax (250.0f, (2000.0f + frame.lips * 1500.0f) * lipLengthScale * gender);
        const auto nasalFreq = juce::jmax (400.0f, (10000.0f - frame.nasal * 9000.0f) * gender);
        const auto q = 2.5f + intensity * 1.5f + frame.throat * 1.25f;

        f1.setCoefficients (juce::IIRCoefficients::makePeakFilter (sampleRate, f1Freq, q, juce::Decibels::decibelsToGain (12.0f * intensity)));
        f2.setCoefficients (juce::IIRCoefficients::makePeakFilter (sampleRate, f2Freq, q, juce::Decibels::decibelsToGain (12.0f * intensity)));
        f3.setCoefficients (juce::IIRCoefficients::makePeakFilter (sampleRate, f3Freq, q, juce::Decibels::decibelsToGain (10.0f * intensity)));
        nasal.setCoefficients (juce::IIRCoefficients::makeLowPass (sampleRate, nasalFreq));
        dcBlock.setCoefficients (juce::IIRCoefficients::makeHighPass (sampleRate, 30.0));

        lastFormants = { f1Freq, f2Freq, f3Freq };
    }

    double sampleRate = 44100.0;
    juce::IIRFilter f1;
    juce::IIRFilter f2;
    juce::IIRFilter f3;
    juce::IIRFilter nasal;
    juce::IIRFilter dcBlock;
    juce::Random random;
    std::array<float, 3> lastFormants { 500.0f, 1500.0f, 2500.0f };
};
} // namespace otonashi
