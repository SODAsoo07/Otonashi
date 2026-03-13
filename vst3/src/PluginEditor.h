#pragma once

#include <JuceHeader.h>

namespace otonashi
{
class OtonashiTractAudioProcessor;

class OtonashiTractAudioProcessorEditor final : public juce::AudioProcessorEditor,
                                                private juce::Timer
{
public:
    explicit OtonashiTractAudioProcessorEditor (OtonashiTractAudioProcessor& processor);
    ~OtonashiTractAudioProcessorEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;

    OtonashiTractAudioProcessor& processorRef;

    juce::TabbedComponent tabs { juce::TabbedButtonBar::TabsAtTop };

    class PerformTab;
    class AnalysisTab;
    class TractTab;

    std::unique_ptr<PerformTab> performTab;
    std::unique_ptr<AnalysisTab> analysisTab;
    std::unique_ptr<TractTab> tractTab;

    juce::Label footerLabel;
};
} // namespace otonashi
