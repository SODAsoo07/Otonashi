#pragma once

#include <JuceHeader.h>

namespace otonashi
{
enum class LanguageMode
{
    jp = 0,
    kr,
    en
};

enum class InterpolationMode
{
    linear = 0,
    curve
};

enum class PitchSourceMode
{
    autoDetect = 0,
    manual,
    envelope
};

enum class SubharmonicMode
{
    half = 0,
    third,
    blend
};

enum class QualityMode
{
    eco = 0,
    normal,
    hq
};

inline juce::String toString (LanguageMode mode)
{
    switch (mode)
    {
        case LanguageMode::jp: return "JP";
        case LanguageMode::kr: return "KR";
        case LanguageMode::en: return "EN";
    }

    return "JP";
}

inline LanguageMode languageModeFromString (const juce::String& value)
{
    if (value.equalsIgnoreCase ("KR"))
        return LanguageMode::kr;

    if (value.equalsIgnoreCase ("EN"))
        return LanguageMode::en;

    return LanguageMode::jp;
}

struct AnalysisPoint
{
    double tSeconds = 0.0;
    float value = 0.0f;
    float confidence = 1.0f;
};

struct TractFrame
{
    float tongueX = 0.5f;
    float tongueY = 0.4f;
    float lips = 0.7f;
    float lipLen = 0.5f;
    float throat = 0.5f;
    float nasal = 0.2f;
    float breath = 0.01f;
    float gender = 1.0f;
    float intensity = 1.0f;
    float pitchHz = 220.0f;
    float voicedProb = 0.0f;
};

inline float cubicHermite (float p0, float p1, float p2, float p3, float t) noexcept
{
    const auto a = 2.0f * p0 - 5.0f * p1 + 4.0f * p2 - p3;
    const auto b = -p0 + 3.0f * p1 - 3.0f * p2 + p3;
    const auto c = p2 - p0;
    const auto d = 2.0f * p1;
    return 0.5f * (a * t * t * t + b * t * t + c * t + d);
}

struct EnvelopeLane
{
    juce::String id;
    InterpolationMode interpolation = InterpolationMode::linear;
    juce::Array<AnalysisPoint> points;

    float evaluate (double timeSeconds) const
    {
        if (points.isEmpty())
            return 0.0f;

        if (timeSeconds <= points.getFirst().tSeconds)
            return points.getFirst().value;

        if (timeSeconds >= points.getLast().tSeconds)
            return points.getLast().value;

        for (int i = 0; i < points.size() - 1; ++i)
        {
            const auto& left = points.getReference (i);
            const auto& right = points.getReference (i + 1);

            if (timeSeconds >= left.tSeconds && timeSeconds <= right.tSeconds)
            {
                const auto span = juce::jmax (1.0e-6, right.tSeconds - left.tSeconds);
                const auto t = static_cast<float> ((timeSeconds - left.tSeconds) / span);

                if (interpolation == InterpolationMode::curve && points.size() >= 4)
                {
                    const auto p0 = points.getReference (juce::jmax (0, i - 1)).value;
                    const auto p1 = left.value;
                    const auto p2 = right.value;
                    const auto p3 = points.getReference (juce::jmin (points.size() - 1, i + 2)).value;
                    return cubicHermite (p0, p1, p2, p3, juce::jlimit (0.0f, 1.0f, t));
                }

                return juce::jmap (t, left.value, right.value);
            }
        }

        return points.getLast().value;
    }

    double getDurationSeconds() const noexcept
    {
        return points.isEmpty() ? 0.0 : points.getLast().tSeconds;
    }

    juce::ValueTree toValueTree() const
    {
        juce::ValueTree laneTree ("Lane");
        laneTree.setProperty ("id", id, nullptr);
        laneTree.setProperty ("interpolation", interpolation == InterpolationMode::curve ? "curve" : "linear", nullptr);

        for (const auto& point : points)
        {
            juce::ValueTree pointTree ("Point");
            pointTree.setProperty ("time", point.tSeconds, nullptr);
            pointTree.setProperty ("value", point.value, nullptr);
            pointTree.setProperty ("confidence", point.confidence, nullptr);
            laneTree.addChild (pointTree, -1, nullptr);
        }

        return laneTree;
    }

    static EnvelopeLane fromValueTree (const juce::ValueTree& laneTree)
    {
        EnvelopeLane lane;
        lane.id = laneTree["id"].toString();
        lane.interpolation = laneTree["interpolation"].toString() == "curve" ? InterpolationMode::curve : InterpolationMode::linear;

        for (int i = 0; i < laneTree.getNumChildren(); ++i)
        {
            const auto pointTree = laneTree.getChild (i);
            if (! pointTree.hasType ("Point"))
                continue;

            AnalysisPoint point;
            point.tSeconds = static_cast<double> (pointTree.getProperty ("time"));
            point.value = static_cast<float> (static_cast<double> (pointTree.getProperty ("value")));
            point.confidence = static_cast<float> (static_cast<double> (pointTree.getProperty ("confidence", 1.0)));
            lane.points.add (point);
        }

        return lane;
    }
};

struct FormantFrame
{
    double tSeconds = 0.0;
    float f1 = 500.0f;
    float f2 = 1500.0f;
    float f3 = 2500.0f;
    float energy = 0.0f;
    float zcr = 0.0f;
    juce::Array<float> vowelProb;
};

struct ConsonantTag
{
    double tSeconds = 0.0;
    juce::String label;
    float confidence = 0.0f;
};

struct AnalysisConfig
{
    LanguageMode language = LanguageMode::jp;
    float sensitivity = 0.6f;
    float smoothing = 0.55f;
    float applyBlend = 1.0f;
    bool detectConsonants = true;
    bool useLanes = true;
    QualityMode quality = QualityMode::normal;

    juce::ValueTree toValueTree() const
    {
        juce::ValueTree tree ("AnalysisConfig");
        tree.setProperty ("language", toString (language), nullptr);
        tree.setProperty ("sensitivity", sensitivity, nullptr);
        tree.setProperty ("smoothing", smoothing, nullptr);
        tree.setProperty ("applyBlend", applyBlend, nullptr);
        tree.setProperty ("detectConsonants", detectConsonants, nullptr);
        tree.setProperty ("useLanes", useLanes, nullptr);
        tree.setProperty ("quality", static_cast<int> (quality), nullptr);
        return tree;
    }

    static AnalysisConfig fromValueTree (const juce::ValueTree& tree)
    {
        AnalysisConfig config;
        config.language = languageModeFromString (tree["language"].toString());
        config.sensitivity = static_cast<float> (static_cast<double> (tree.getProperty ("sensitivity", 0.6)));
        config.smoothing = static_cast<float> (static_cast<double> (tree.getProperty ("smoothing", 0.55)));
        config.applyBlend = static_cast<float> (static_cast<double> (tree.getProperty ("applyBlend", 1.0)));
        config.detectConsonants = static_cast<bool> (tree.getProperty ("detectConsonants", true));
        config.useLanes = static_cast<bool> (tree.getProperty ("useLanes", true));
        config.quality = static_cast<QualityMode> (static_cast<int> (tree.getProperty ("quality", static_cast<int> (QualityMode::normal))));
        return config;
    }
};

struct AnalysisResult
{
    double durationSeconds = 0.0;
    juce::Array<AnalysisPoint> pitchPoints;
    juce::Array<FormantFrame> formantFrames;
    juce::Array<ConsonantTag> consonantTags;
    juce::Array<EnvelopeLane> suggestedLanes;

    bool isValid() const noexcept
    {
        return durationSeconds > 0.0 && (! formantFrames.isEmpty() || ! pitchPoints.isEmpty());
    }
};
} // namespace otonashi
