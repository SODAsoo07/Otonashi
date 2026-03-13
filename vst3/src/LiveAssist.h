#pragma once

#include <atomic>
#include <vector>

#include <JuceHeader.h>

namespace otonashi
{
struct LiveAssistState
{
    float f0Hz = 0.0f;
    float voicedProb = 0.0f;
    float confidence = 0.0f;
};

class LiveAssistDetector
{
public:
    void prepare (double newSampleRate)
    {
        sampleRate = juce::jmax (1.0, newSampleRate);
        analysisStride = sampleRate > 64000.0 ? 4 : (sampleRate > 32000.0 ? 2 : 1);
        effectiveSampleRate = sampleRate / static_cast<double> (analysisStride);
        analysisWindowSize = juce::jmax (256, static_cast<int> (std::round (effectiveSampleRate * 0.03)));
        analysisWindowSizeFull = analysisWindowSize * analysisStride;
        hopSize = juce::jmax (64, static_cast<int> (std::round (sampleRate * 0.01)));
        ring.assign (static_cast<size_t> (analysisWindowSizeFull), 0.0f);
        window.assign (static_cast<size_t> (analysisWindowSize), 0.0f);
        writeIndex = 0;
        samplesSinceAnalysis = 0;
        f0Hz.store (0.0f);
        voicedProb.store (0.0f);
        confidence.store (0.0f);
    }

    void reset()
    {
        std::fill (ring.begin(), ring.end(), 0.0f);
        std::fill (window.begin(), window.end(), 0.0f);
        writeIndex = 0;
        samplesSinceAnalysis = 0;
        f0Hz.store (0.0f);
        voicedProb.store (0.0f);
        confidence.store (0.0f);
    }

    void pushSamples (const float* samples, int numSamples) noexcept
    {
        if (samples == nullptr || numSamples <= 0 || analysisWindowSizeFull <= 0)
            return;

        for (int i = 0; i < numSamples; ++i)
        {
            ring[static_cast<size_t> (writeIndex)] = samples[i];
            writeIndex = (writeIndex + 1) % juce::jmax (1, analysisWindowSizeFull);

            if (++samplesSinceAnalysis >= hopSize)
            {
                samplesSinceAnalysis = 0;
                analyzeWindow();
            }
        }
    }

    LiveAssistState getState() const noexcept
    {
        return { f0Hz.load(), voicedProb.load(), confidence.load() };
    }

private:
    void analyzeWindow() noexcept
    {
        if (analysisWindowSize <= 0 || analysisWindowSizeFull <= 0 || window.size() != static_cast<size_t> (analysisWindowSize))
            return;

        for (int i = 0; i < analysisWindowSize; ++i)
            window[static_cast<size_t> (i)] = ring[static_cast<size_t> ((writeIndex + i * analysisStride) % analysisWindowSizeFull)];

        float energy = 0.0f;
        for (const auto sample : window)
            energy += sample * sample;
        energy = std::sqrt (energy / static_cast<float> (analysisWindowSize));

        if (energy < 0.01f)
        {
            f0Hz.store (0.0f);
            voicedProb.store (0.0f);
            confidence.store (0.0f);
            return;
        }

        const auto minLag = juce::jmax (1, static_cast<int> (effectiveSampleRate / 600.0));
        const auto maxLag = juce::jmin (analysisWindowSize - 2, static_cast<int> (effectiveSampleRate / 50.0));

        float bestCorrelation = 0.0f;
        int bestLag = 0;

        for (int lag = minLag; lag <= maxLag; ++lag)
        {
            float correlation = 0.0f;
            float normA = 0.0f;
            float normB = 0.0f;

            for (int i = 0; i < analysisWindowSize - lag; ++i)
            {
                const auto a = window[static_cast<size_t> (i)];
                const auto b = window[static_cast<size_t> (i + lag)];
                correlation += a * b;
                normA += a * a;
                normB += b * b;
            }

            const auto denom = std::sqrt (normA * normB) + 1.0e-6f;
            const auto normalized = correlation / denom;

            if (normalized > bestCorrelation)
            {
                bestCorrelation = normalized;
                bestLag = lag;
            }
        }

        const auto candidateF0 = bestLag > 0 ? static_cast<float> (effectiveSampleRate / static_cast<double> (bestLag)) : 0.0f;
        const auto candidateConfidence = juce::jlimit (0.0f, 1.0f, (bestCorrelation - 0.2f) / 0.8f);
        const auto candidateVoiced = juce::jlimit (0.0f, 1.0f, energy * 18.0f * candidateConfidence);

        const auto previousF0 = f0Hz.load();
        f0Hz.store (candidateVoiced > 0.2f && candidateF0 > 0.0f ? (previousF0 * 0.8f + candidateF0 * 0.2f) : 0.0f);
        voicedProb.store (candidateVoiced);
        confidence.store (candidateConfidence);
    }

    double sampleRate = 44100.0;
    int analysisWindowSize = 0;
    int analysisWindowSizeFull = 0;
    int hopSize = 0;
    int writeIndex = 0;
    int samplesSinceAnalysis = 0;
    int analysisStride = 1;
    double effectiveSampleRate = 44100.0;
    std::vector<float> ring;
    std::vector<float> window;
    std::atomic<float> f0Hz { 0.0f };
    std::atomic<float> voicedProb { 0.0f };
    std::atomic<float> confidence { 0.0f };
};
} // namespace otonashi
