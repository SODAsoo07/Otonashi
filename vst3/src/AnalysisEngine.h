#pragma once

#include <JuceHeader.h>

#include "OtonashiTypes.h"

namespace otonashi
{
class AnalysisEngine
{
public:
    static AnalysisResult analyze (const juce::AudioBuffer<float>& monoBuffer, double sampleRate, const AnalysisConfig& config);
};
} // namespace otonashi
