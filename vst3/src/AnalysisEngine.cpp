#include "AnalysisEngine.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace otonashi
{
namespace
{
struct Anchor
{
    const char* label;
    float f1;
    float f2;
    TractFrame tract;
};

std::vector<Anchor> getAnchors (LanguageMode mode)
{
    const std::vector<Anchor> jp {
        { "A", 800.0f, 1200.0f, { 0.2f, 0.1f, 0.9f, 0.5f, 0.1f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
        { "I", 300.0f, 2500.0f, { 0.9f, 0.9f, 0.2f, 0.5f, 0.2f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
        { "U", 320.0f, 1100.0f, { 0.1f, 0.8f, 0.2f, 0.8f, 0.4f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
        { "E", 500.0f, 1800.0f, { 0.6f, 0.5f, 0.7f, 0.5f, 0.3f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
        { "O", 500.0f, 850.0f,  { 0.2f, 0.4f, 0.3f, 0.6f, 0.5f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
        { "N", 220.0f, 1300.0f, { 0.5f, 0.1f, 0.0f, 0.8f, 0.4f, 1.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } }
    };

    if (mode == LanguageMode::kr)
    {
        return {
            jp[0], jp[1], jp[2], jp[3], jp[4],
            { "Eu", 350.0f, 1400.0f, { 0.5f, 0.8f, 0.2f, 0.0f, 0.3f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
            { "Eo", 600.0f, 1000.0f, { 0.3f, 0.3f, 0.5f, 0.3f, 0.6f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
            jp[5]
        };
    }

    if (mode == LanguageMode::en)
    {
        return {
            jp[0], jp[1], jp[2], jp[3], jp[4],
            { "Ae", 700.0f, 1700.0f, { 0.5f, 0.2f, 0.8f, 0.1f, 0.2f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
            { "Uh", 600.0f, 1200.0f, { 0.4f, 0.4f, 0.4f, 0.4f, 0.5f, 0.0f, 0.01f, 1.0f, 1.0f, 220.0f, 1.0f } },
            jp[5]
        };
    }

    return jp;
}

std::vector<AnalysisPoint> simplifyPointsRecursive (const std::vector<AnalysisPoint>& points, float tolerance)
{
    if (points.size() < 3)
        return points;

    auto maxSqDistance = 0.0;
    size_t index = 0;
    const auto end = points.size() - 1;

    for (size_t i = 1; i < end; ++i)
    {
        const auto dx = points[end].tSeconds - points[0].tSeconds;
        const auto dy = static_cast<double> (points[end].value - points[0].value);
        const auto denom = std::sqrt (dx * dx + dy * dy) + 1.0e-6;
        const auto numerator = std::abs (dy * points[i].tSeconds - dx * points[i].value + points[end].tSeconds * points[0].value - points[end].value * points[0].tSeconds);
        const auto sqDistance = std::pow (numerator / denom, 2.0);

        if (sqDistance > maxSqDistance)
        {
            maxSqDistance = sqDistance;
            index = i;
        }
    }

    if (maxSqDistance > static_cast<double> (tolerance * tolerance))
    {
        const std::vector<AnalysisPoint> left (points.begin(), points.begin() + static_cast<std::ptrdiff_t> (index + 1));
        const std::vector<AnalysisPoint> right (points.begin() + static_cast<std::ptrdiff_t> (index), points.end());

        auto resultLeft = simplifyPointsRecursive (left, tolerance);
        auto resultRight = simplifyPointsRecursive (right, tolerance);
        resultLeft.pop_back();
        resultLeft.insert (resultLeft.end(), resultRight.begin(), resultRight.end());
        return resultLeft;
    }

    return { points.front(), points.back() };
}

std::vector<AnalysisPoint> detectPitch (const juce::AudioBuffer<float>& buffer, double sampleRate, float sensitivity, QualityMode quality)
{
    std::vector<AnalysisPoint> points;
    if (buffer.getNumChannels() == 0)
        return points;

    const auto* data = buffer.getReadPointer (0);
    const auto sampleRateFloat = static_cast<float> (sampleRate);
    constexpr int windowSize = 2048;
    auto stepSize = 1024;

    if (quality == QualityMode::eco)
        stepSize *= 2;
    else if (quality == QualityMode::hq)
        stepSize = juce::jmax (256, stepSize / 2);

    for (int i = 0; i < buffer.getNumSamples() - windowSize; i += stepSize)
    {
        float sumSq = 0.0f;
        for (int j = 0; j < windowSize; ++j)
            sumSq += data[i + j] * data[i + j];

        if (std::sqrt (sumSq / static_cast<float> (windowSize)) < 0.02f)
            continue;

        auto bestOffset = -1;
        auto maxCorrelation = -1.0f;
        const auto minOffset = static_cast<int> (sampleRateFloat / 600.0f);
        const auto maxOffset = static_cast<int> (sampleRateFloat / 50.0f);

        for (int offset = minOffset; offset < maxOffset; ++offset)
        {
            float correlation = 0.0f;
            for (int j = 0; j < windowSize - offset; ++j)
                correlation += data[i + j] * data[i + j + offset];

            if (correlation > maxCorrelation)
            {
                maxCorrelation = correlation;
                bestOffset = offset;
            }
        }

        if (bestOffset > 0)
        {
            const auto frequency = sampleRateFloat / static_cast<float> (bestOffset);
            if (frequency >= 50.0f && frequency <= 600.0f)
                points.push_back ({ static_cast<double> (i) / sampleRateFloat, frequency, 1.0f });
        }
    }

    if (points.size() < 3)
        return points;

    const auto tolerance = 1.0f + (1.0f - juce::jlimit (0.0f, 1.0f, sensitivity)) * 50.0f;
    return simplifyPointsRecursive (points, tolerance);
}

std::vector<FormantFrame> analyzeFormants (const juce::AudioBuffer<float>& buffer, double sampleRate, QualityMode quality)
{
    std::vector<FormantFrame> frames;
    if (buffer.getNumChannels() == 0)
        return frames;

    const auto* data = buffer.getReadPointer (0);
    const auto sampleRateFloat = static_cast<float> (sampleRate);
    const auto windowSize = static_cast<int> (0.025 * sampleRateFloat);
    auto stepSize = static_cast<int> (0.01 * sampleRateFloat);
    if (quality == QualityMode::eco)
        stepSize = static_cast<int> (0.02 * sampleRateFloat);
    else if (quality == QualityMode::hq)
        stepSize = static_cast<int> (0.005 * sampleRateFloat);
    constexpr int order = 16;

    for (int start = 0; start < buffer.getNumSamples() - windowSize; start += stepSize)
    {
        std::vector<float> segment (static_cast<size_t> (windowSize), 0.0f);
        float sumSq = 0.0f;
        int zcrCount = 0;

        for (int j = 0; j < windowSize; ++j)
        {
            const auto raw = data[start + j];
            if (j > 0 && ((raw >= 0.0f && data[start + j - 1] < 0.0f) || (raw < 0.0f && data[start + j - 1] >= 0.0f)))
                ++zcrCount;

            const auto value = j > 0 ? raw - 0.95f * data[start + j - 1] : raw;
            const auto hamming = 0.54f - 0.46f * std::cos ((2.0f * juce::MathConstants<float>::pi * static_cast<float> (j)) / static_cast<float> (windowSize - 1));
            segment[static_cast<size_t> (j)] = value * hamming;
            sumSq += segment[static_cast<size_t> (j)] * segment[static_cast<size_t> (j)];
        }

        const auto rms = std::sqrt (sumSq / static_cast<float> (windowSize));
        const auto zcr = static_cast<float> (zcrCount) / static_cast<float> (windowSize);

        std::array<double, order + 1> r {};
        for (int k = 0; k <= order; ++k)
            for (int j = 0; j < windowSize - k; ++j)
                r[static_cast<size_t> (k)] += segment[static_cast<size_t> (j)] * segment[static_cast<size_t> (j + k)];

        std::array<double, order + 1> a {};
        std::array<double, order + 1> e {};
        a[0] = 1.0;
        e[0] = r[0];

        for (int k = 1; k <= order; ++k)
        {
            auto lambda = 0.0;
            for (int j = 0; j < k; ++j)
                lambda -= a[static_cast<size_t> (j)] * r[static_cast<size_t> (k - j)];

            lambda /= e[static_cast<size_t> (k - 1)] + 1.0e-6;
            const auto previousA = a;

            for (int j = 1; j < k; ++j)
                a[static_cast<size_t> (j)] = previousA[static_cast<size_t> (j)] + lambda * previousA[static_cast<size_t> (k - j)];

            a[static_cast<size_t> (k)] = lambda;
            e[static_cast<size_t> (k)] = e[static_cast<size_t> (k - 1)] * (1.0 - lambda * lambda);
        }

        struct Peak { float frequency = 0.0f; float magnitude = 0.0f; };
        std::vector<Peak> peaks;
        float previousMagnitude = 0.0f;
        float previousSlope = 0.0f;

        for (int frequency = 50; frequency < 5500; frequency += 10)
        {
            const auto w = 2.0 * juce::MathConstants<double>::pi * static_cast<double> (frequency) / sampleRateFloat;
            auto real = 0.0;
            auto imag = 0.0;

            for (int k = 0; k <= order; ++k)
            {
                real += a[static_cast<size_t> (k)] * std::cos (static_cast<double> (k) * w);
                imag -= a[static_cast<size_t> (k)] * std::sin (static_cast<double> (k) * w);
            }

            const auto magnitude = 1.0 / std::sqrt (real * real + imag * imag + 1.0e-6);
            const auto slope = static_cast<float> (magnitude) - previousMagnitude;

            if (previousSlope > 0.0f && slope < 0.0f)
                peaks.push_back ({ static_cast<float> (frequency - 10), previousMagnitude });

            previousMagnitude = static_cast<float> (magnitude);
            previousSlope = slope;
        }

        std::sort (peaks.begin(), peaks.end(), [] (const Peak& aPeak, const Peak& bPeak) { return aPeak.frequency < bPeak.frequency; });

        const auto previousFrame = frames.empty() ? FormantFrame {} : frames.back();
        auto f1 = previousFrame.f1 > 0.0f ? previousFrame.f1 : 500.0f;
        auto f2 = previousFrame.f2 > 0.0f ? previousFrame.f2 : 1500.0f;
        auto f3 = previousFrame.f3 > 0.0f ? previousFrame.f3 : 2500.0f;

        const auto p1 = std::find_if (peaks.begin(), peaks.end(), [] (const Peak& peak) { return peak.frequency >= 150.0f && peak.frequency < 1100.0f; });

        if (p1 != peaks.end())
        {
            f1 = p1->frequency;
            const auto p2 = std::find_if (peaks.begin(), peaks.end(), [f1] (const Peak& peak) { return peak.frequency > f1 + 200.0f && peak.frequency < 3000.0f; });

            if (p2 != peaks.end())
            {
                f2 = p2->frequency;
                const auto p3 = std::find_if (peaks.begin(), peaks.end(), [f2] (const Peak& peak) { return peak.frequency > f2 + 400.0f && peak.frequency < 5200.0f; });
                f3 = p3 != peaks.end() ? p3->frequency : juce::jmax (f2 + 400.0f, previousFrame.f3 > 0.0f ? previousFrame.f3 : 2500.0f);
            }
            else
            {
                f2 = juce::jmax (f1 + 200.0f, previousFrame.f2 > 0.0f ? previousFrame.f2 : 1500.0f);
                f3 = juce::jmax (f2 + 600.0f, previousFrame.f3 > 0.0f ? previousFrame.f3 : 2500.0f);
            }
        }

        frames.push_back ({ static_cast<double> (start) / sampleRateFloat, f1, f2, f3, rms, zcr, {} });
    }

    return frames;
}

AnalysisResult buildResult (const std::vector<FormantFrame>& rawFrames, const std::vector<AnalysisPoint>& pitchPoints, const AnalysisConfig& config)
{
    AnalysisResult result;
    if (rawFrames.empty())
        return result;

    const auto anchors = getAnchors (config.language);
    auto maxEnergy = 0.0f;
    for (const auto& frame : rawFrames)
        maxEnergy = juce::jmax (maxEnergy, frame.energy);

    FormantFrame lastFrame;
    lastFrame.f1 = 500.0f;
    lastFrame.f2 = 1500.0f;
    lastFrame.f3 = 2500.0f;
    constexpr float maxDist = 450.0f;

    for (auto frame : rawFrames)
    {
        frame.f1 = lastFrame.f1 * 0.3f + frame.f1 * 0.7f;
        frame.f2 = lastFrame.f2 * 0.3f + frame.f2 * 0.7f;
        lastFrame = frame;

        float total = 0.0f;
        for (const auto& anchor : anchors)
        {
            const auto dist = std::sqrt (std::pow ((frame.f1 - anchor.f1) * 1.5f, 2.0f) + std::pow ((frame.f2 - anchor.f2) * 0.8f, 2.0f));
            const auto probability = std::exp (-(dist * dist) / (2.0f * std::pow (maxDist / juce::jmax (0.1f, config.sensitivity), 2.0f)));
            frame.vowelProb.add (probability);
            total += probability;
        }

        total = juce::jmax (1.0e-6f, total);
        for (auto& probability : frame.vowelProb)
            probability /= total;

        result.formantFrames.add (frame);
    }

    for (const auto& point : pitchPoints)
        result.pitchPoints.add (point);

    const auto duration = result.formantFrames.getLast().tSeconds;
    result.durationSeconds = duration;

    EnvelopeLane pitchLane;
    pitchLane.id = "pitch";
    pitchLane.interpolation = InterpolationMode::curve;
    for (const auto& point : result.pitchPoints)
        pitchLane.points.add (point);

    if (! pitchLane.points.isEmpty())
        result.suggestedLanes.add (pitchLane);

    EnvelopeLane voicedLane { "voiced", InterpolationMode::linear, {} };
    EnvelopeLane tongueXLane { "tongueX", InterpolationMode::curve, {} };
    EnvelopeLane tongueYLane { "tongueY", InterpolationMode::curve, {} };
    EnvelopeLane lipsLane { "lips", InterpolationMode::curve, {} };
    EnvelopeLane lipLenLane { "lipLen", InterpolationMode::curve, {} };
    EnvelopeLane throatLane { "throat", InterpolationMode::curve, {} };
    EnvelopeLane nasalLane { "nasal", InterpolationMode::curve, {} };

    const auto silenceThreshold = maxEnergy * 0.1f;
    const auto closureThreshold = maxEnergy * 0.3f;
    auto lastParams = TractFrame {};
    auto lastSavedParams = lastParams;
    auto lastSavedTime = -100.0;
    const auto alpha = 1.0f - juce::jlimit (0.0f, 1.0f, config.smoothing);

    for (int i = 0; i < result.formantFrames.size(); ++i)
    {
        const auto& frame = result.formantFrames.getReference (i);
        TractFrame target {};
        float strongestProbability = 0.0f;

        for (int anchorIndex = 0; anchorIndex < anchors.size() && anchorIndex < frame.vowelProb.size(); ++anchorIndex)
        {
            const auto prob = frame.vowelProb.getUnchecked (anchorIndex);
            strongestProbability = juce::jmax (strongestProbability, prob);
            target.tongueX += anchors[static_cast<size_t> (anchorIndex)].tract.tongueX * prob;
            target.tongueY += anchors[static_cast<size_t> (anchorIndex)].tract.tongueY * prob;
            target.lips += anchors[static_cast<size_t> (anchorIndex)].tract.lips * prob;
            target.lipLen += anchors[static_cast<size_t> (anchorIndex)].tract.lipLen * prob;
            target.throat += anchors[static_cast<size_t> (anchorIndex)].tract.throat * prob;
            target.nasal += anchors[static_cast<size_t> (anchorIndex)].tract.nasal * prob;
        }

        const auto isSilence = frame.energy < silenceThreshold;
        if (isSilence)
        {
            target.lips *= 0.1f;
            target.nasal = 0.0f;
        }

        if (config.detectConsonants && ! isSilence)
        {
            const auto isLowEnergy = frame.energy < closureThreshold && frame.energy > silenceThreshold;
            const auto isLowZcr = frame.zcr < 0.15f;

            if (isLowEnergy && isLowZcr)
            {
                target.lips = 0.0f;
                target.lipLen = 0.6f;

                if (frame.f1 < 300.0f)
                {
                    target.nasal = 0.8f;
                    result.consonantTags.add ({ frame.tSeconds, "BilabialNasal", 0.7f });
                }
                else
                {
                    result.consonantTags.add ({ frame.tSeconds, "BilabialClosure", 0.6f });
                }
            }

            if (frame.zcr > 0.3f)
            {
                const auto intensity = juce::jlimit (0.0f, 1.0f, (frame.zcr - 0.3f) * 5.0f);
                target.tongueX = target.tongueX * (1.0f - intensity) + 0.8f * intensity;
                target.tongueY = target.tongueY * (1.0f - intensity) + 0.9f * intensity;
                target.lips = target.lips * (1.0f - intensity) + 0.3f * intensity;
                target.lipLen = target.lipLen * (1.0f - intensity) + 0.2f * intensity;
                result.consonantTags.add ({ frame.tSeconds, "Sibilant", intensity });
            }
        }

        const TractFrame current {
            lastParams.tongueX + alpha * (target.tongueX - lastParams.tongueX),
            lastParams.tongueY + alpha * (target.tongueY - lastParams.tongueY),
            lastParams.lips + alpha * (target.lips - lastParams.lips),
            lastParams.lipLen + alpha * (target.lipLen - lastParams.lipLen),
            lastParams.throat + alpha * (target.throat - lastParams.throat),
            lastParams.nasal + alpha * (target.nasal - lastParams.nasal),
            0.01f,
            1.0f,
            1.0f,
            220.0f,
            juce::jlimit (0.0f, 1.0f, frame.energy / juce::jmax (0.0001f, maxEnergy))
        };

        lastParams = current;
        const auto delta = std::abs (current.tongueX - lastSavedParams.tongueX) + std::abs (current.lips - lastSavedParams.lips);
        if (i == result.formantFrames.size() - 1 || delta > 0.05f || (frame.tSeconds - lastSavedTime) > 0.1)
        {
            tongueXLane.points.add ({ frame.tSeconds, current.tongueX, strongestProbability });
            tongueYLane.points.add ({ frame.tSeconds, current.tongueY, strongestProbability });
            lipsLane.points.add ({ frame.tSeconds, current.lips, strongestProbability });
            lipLenLane.points.add ({ frame.tSeconds, current.lipLen, strongestProbability });
            throatLane.points.add ({ frame.tSeconds, current.throat, strongestProbability });
            nasalLane.points.add ({ frame.tSeconds, current.nasal, strongestProbability });
            voicedLane.points.add ({ frame.tSeconds, current.voicedProb, strongestProbability });
            lastSavedParams = current;
            lastSavedTime = frame.tSeconds;
        }
    }

    result.suggestedLanes.add (tongueXLane);
    result.suggestedLanes.add (tongueYLane);
    result.suggestedLanes.add (lipsLane);
    result.suggestedLanes.add (lipLenLane);
    result.suggestedLanes.add (throatLane);
    result.suggestedLanes.add (nasalLane);
    result.suggestedLanes.add (voicedLane);
    return result;
}
} // namespace

AnalysisResult AnalysisEngine::analyze (const juce::AudioBuffer<float>& monoBuffer, double sampleRate, const AnalysisConfig& config)
{
    if (monoBuffer.getNumChannels() == 0 || monoBuffer.getNumSamples() == 0)
        return {};

    const auto maxSamples = static_cast<int> (std::round (sampleRate * 7.0));
    const auto samplesToCopy = juce::jmin (monoBuffer.getNumSamples(), maxSamples);
    const auto startSample = monoBuffer.getNumSamples() - samplesToCopy;

    juce::AudioBuffer<float> working (1, samplesToCopy);
    working.copyFrom (0, 0, monoBuffer, 0, startSample, samplesToCopy);

    const auto pitch = detectPitch (working, sampleRate, config.sensitivity, config.quality);
    const auto formants = analyzeFormants (working, sampleRate, config.quality);
    return buildResult (formants, pitch, config);
}
} // namespace otonashi
