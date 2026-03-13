#include "PluginEditor.h"

#include "PluginProcessor.h"

namespace otonashi
{
namespace
{
using Attachment = juce::AudioProcessorValueTreeState::SliderAttachment;
using ComboAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;
using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;

class LabeledSlider final : public juce::Component
{
public:
    LabeledSlider (const juce::String& labelText,
                   juce::AudioProcessorValueTreeState& state,
                   const juce::String& paramId)
        : label (labelText),
          attachment (state, paramId, slider)
    {
        slider.setSliderStyle (juce::Slider::LinearHorizontal);
        slider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 60, 18);
        addAndMakeVisible (label);
        addAndMakeVisible (slider);
    }

    void resized() override
    {
        auto area = getLocalBounds();
        label.setBounds (area.removeFromLeft (120));
        slider.setBounds (area);
    }

private:
    juce::Label label;
    juce::Slider slider;
    Attachment attachment;
};

class LabeledCombo final : public juce::Component
{
public:
    LabeledCombo (const juce::String& labelText,
                  juce::AudioProcessorValueTreeState& state,
                  const juce::String& paramId,
                  const juce::StringArray& items)
        : label (labelText),
          attachment (state, paramId, combo)
    {
        for (int i = 0; i < items.size(); ++i)
            combo.addItem (items[i], i + 1);
        combo.setSelectedItemIndex (0);
        addAndMakeVisible (label);
        addAndMakeVisible (combo);
    }

    void resized() override
    {
        auto area = getLocalBounds();
        label.setBounds (area.removeFromLeft (120));
        combo.setBounds (area.reduced (0, 2));
    }

private:
    juce::Label label;
    juce::ComboBox combo;
    ComboAttachment attachment;
};

class LabeledToggle final : public juce::Component
{
public:
    LabeledToggle (const juce::String& labelText,
                   juce::AudioProcessorValueTreeState& state,
                   const juce::String& paramId)
        : label (labelText),
          attachment (state, paramId, toggle)
    {
        addAndMakeVisible (label);
        addAndMakeVisible (toggle);
    }

    void resized() override
    {
        auto area = getLocalBounds();
        label.setBounds (area.removeFromLeft (160));
        toggle.setBounds (area.removeFromLeft (40));
    }

private:
    juce::Label label;
    juce::ToggleButton toggle;
    ButtonAttachment attachment;
};

class PerformTab final : public juce::Component
{
public:
    explicit PerformTab (OtonashiTractAudioProcessor& processor)
        : processorRef (processor),
          wet ("Dry/Wet", processor.getValueTreeState(), ParamIDs::wet),
          output ("Output (dB)", processor.getValueTreeState(), ParamIDs::output),
          pitchSource ("Pitch Source", processor.getValueTreeState(), ParamIDs::pitchSource, { "Auto", "Manual", "Envelope" }),
          manualPitch ("Manual Pitch (Hz)", processor.getValueTreeState(), ParamIDs::manualPitchHz),
          pitchFollow ("Pitch Follow", processor.getValueTreeState(), ParamIDs::pitchFollow),
          subAmount ("Sub Amount", processor.getValueTreeState(), ParamIDs::subAmount),
          subMode ("Sub Mode", processor.getValueTreeState(), ParamIDs::subMode, { "Half", "Third", "Blend" }),
          harmonicAmount ("Harmonic Amount", processor.getValueTreeState(), ParamIDs::harmonicAmount),
          harmonicCount ("Harmonic Count", processor.getValueTreeState(), ParamIDs::harmonicCount),
          oddEven ("Odd/Even Bias", processor.getValueTreeState(), ParamIDs::oddEvenBias),
          tilt ("Spectral Tilt", processor.getValueTreeState(), ParamIDs::spectralTilt),
          inharm ("Inharmonicity", processor.getValueTreeState(), ParamIDs::inharmonicity),
          breathPreserve ("Breath Preserve", processor.getValueTreeState(), ParamIDs::breathPreserve),
          formantFollow ("Formant Follow", processor.getValueTreeState(), ParamIDs::formantFollow),
          quality ("Quality", processor.getValueTreeState(), ParamIDs::quality, { "Eco", "Normal", "HQ" })
    {
        addAndMakeVisible (wet);
        addAndMakeVisible (output);
        addAndMakeVisible (pitchSource);
        addAndMakeVisible (manualPitch);
        addAndMakeVisible (pitchFollow);
        addAndMakeVisible (subAmount);
        addAndMakeVisible (subMode);
        addAndMakeVisible (harmonicAmount);
        addAndMakeVisible (harmonicCount);
        addAndMakeVisible (oddEven);
        addAndMakeVisible (tilt);
        addAndMakeVisible (inharm);
        addAndMakeVisible (breathPreserve);
        addAndMakeVisible (formantFollow);
        addAndMakeVisible (quality);

        liveAssistLabel.setJustificationType (juce::Justification::left);
        addAndMakeVisible (liveAssistLabel);
    }

    void resized() override
    {
        auto area = getLocalBounds().reduced (12);
        auto row = [this, &area]() { return area.removeFromTop (24).reduced (0, 2); };

        wet.setBounds (row());
        output.setBounds (row());
        pitchSource.setBounds (row());
        manualPitch.setBounds (row());
        pitchFollow.setBounds (row());
        subAmount.setBounds (row());
        subMode.setBounds (row());
        harmonicAmount.setBounds (row());
        harmonicCount.setBounds (row());
        oddEven.setBounds (row());
        tilt.setBounds (row());
        inharm.setBounds (row());
        breathPreserve.setBounds (row());
        formantFollow.setBounds (row());
        quality.setBounds (row());
        liveAssistLabel.setBounds (area.removeFromTop (24));
    }

    void updateLiveAssist()
    {
        const auto state = processorRef.getLiveAssistState();
        liveAssistLabel.setText ("Live Assist F0: " + juce::String (state.f0Hz, 1)
                                     + " Hz, Voiced: " + juce::String (state.voicedProb, 2)
                                     + ", Conf: " + juce::String (state.confidence, 2),
                                 juce::dontSendNotification);
    }

private:
    OtonashiTractAudioProcessor& processorRef;
    LabeledSlider wet;
    LabeledSlider output;
    LabeledCombo pitchSource;
    LabeledSlider manualPitch;
    LabeledSlider pitchFollow;
    LabeledSlider subAmount;
    LabeledCombo subMode;
    LabeledSlider harmonicAmount;
    LabeledSlider harmonicCount;
    LabeledSlider oddEven;
    LabeledSlider tilt;
    LabeledSlider inharm;
    LabeledSlider breathPreserve;
    LabeledSlider formantFollow;
    LabeledCombo quality;
    juce::Label liveAssistLabel;
};

class AnalysisTab final : public juce::Component
{
public:
    explicit AnalysisTab (OtonashiTractAudioProcessor& processor)
        : processorRef (processor),
          language ("Language", processor.getValueTreeState(), ParamIDs::analysisLanguage, { "JP", "KR", "EN" }),
          sensitivity ("Sensitivity", processor.getValueTreeState(), ParamIDs::analysisSensitivity),
          smoothing ("Smoothing", processor.getValueTreeState(), ParamIDs::analysisSmoothing),
          applyBlend ("Apply Blend", processor.getValueTreeState(), ParamIDs::analysisApplyBlend),
          consonants ("Consonant Detect", processor.getValueTreeState(), ParamIDs::analysisConsonants),
          useLanes ("Use Envelopes", processor.getValueTreeState(), ParamIDs::analysisUseLanes)
    {
        addAndMakeVisible (language);
        addAndMakeVisible (sensitivity);
        addAndMakeVisible (smoothing);
        addAndMakeVisible (applyBlend);
        addAndMakeVisible (consonants);
        addAndMakeVisible (useLanes);

        analyzeButton.setButtonText ("Analyze Recent Input");
        applyButton.setButtonText ("Apply Result");
        resetButton.setButtonText ("Reset Analysis");

        analyzeButton.onClick = [this]()
        {
            if (! processorRef.isAnalysisBusy())
                processorRef.startAnalysisOfRecentInput();
        };

        applyButton.onClick = [this]()
        {
            processorRef.applyLastAnalysis();
        };

        resetButton.onClick = [this]()
        {
            processorRef.resetAnalysis();
        };

        addAndMakeVisible (analyzeButton);
        addAndMakeVisible (applyButton);
        addAndMakeVisible (resetButton);
        addAndMakeVisible (statusLabel);
        addAndMakeVisible (historyLabel);
        addAndMakeVisible (envelopeLabel);
    }

    void resized() override
    {
        auto area = getLocalBounds().reduced (12);
        auto row = [&area]() { return area.removeFromTop (24).reduced (0, 2); };

        language.setBounds (row());
        sensitivity.setBounds (row());
        smoothing.setBounds (row());
        applyBlend.setBounds (row());
        consonants.setBounds (row());
        useLanes.setBounds (row());

        analyzeButton.setBounds (row());
        applyButton.setBounds (row());
        resetButton.setBounds (row());
        statusLabel.setBounds (row());
        historyLabel.setBounds (row());
        envelopeLabel.setBounds (row());
    }

    void updateStatus()
    {
        const auto busy = processorRef.isAnalysisBusy();
        const auto result = processorRef.getLastAnalysisResult();
        const auto history = processorRef.getCapturedHistorySeconds();
        const auto envelopeSummary = processorRef.getEnvelopeSummary();

        statusLabel.setText (busy ? "Analyzing..." : (result.isValid() ? "Analysis Ready" : "Idle"),
                             juce::dontSendNotification);
        historyLabel.setText ("Input History: " + juce::String (history, 2) + "s",
                              juce::dontSendNotification);
        envelopeLabel.setText ("Envelopes: " + juce::String (envelopeSummary.laneCount)
                                   + " lanes / " + juce::String (envelopeSummary.durationSeconds, 2) + "s",
                               juce::dontSendNotification);
    }

private:
    OtonashiTractAudioProcessor& processorRef;
    LabeledCombo language;
    LabeledSlider sensitivity;
    LabeledSlider smoothing;
    LabeledSlider applyBlend;
    LabeledToggle consonants;
    LabeledToggle useLanes;
    juce::TextButton analyzeButton;
    juce::TextButton applyButton;
    juce::TextButton resetButton;
    juce::Label statusLabel;
    juce::Label historyLabel;
    juce::Label envelopeLabel;
};

class TractPad final : public juce::Component
{
public:
    explicit TractPad (OtonashiTractAudioProcessor& processor)
        : processorRef (processor)
    {
        tongueXParam = processorRef.getValueTreeState().getParameter (ParamIDs::tongueX);
        tongueYParam = processorRef.getValueTreeState().getParameter (ParamIDs::tongueY);
    }

    void paint (juce::Graphics& g) override
    {
        const auto bounds = getLocalBounds().toFloat().reduced (8.0f);
        g.setColour (juce::Colours::darkslategrey);
        g.fillRoundedRectangle (bounds, 6.0f);

        g.setColour (juce::Colours::dimgrey);
        g.drawRoundedRectangle (bounds, 6.0f, 1.0f);

        g.setColour (juce::Colours::black.withAlpha (0.4f));
        g.drawLine (bounds.getX() + bounds.getWidth() * 0.5f, bounds.getY(),
                    bounds.getX() + bounds.getWidth() * 0.5f, bounds.getBottom(), 1.0f);
        g.drawLine (bounds.getX(), bounds.getY() + bounds.getHeight() * 0.5f,
                    bounds.getRight(), bounds.getY() + bounds.getHeight() * 0.5f, 1.0f);

        const auto normX = getParamNormalized (tongueXParam, 0.5f);
        const auto normY = getParamNormalized (tongueYParam, 0.4f);
        const auto x = bounds.getX() + bounds.getWidth() * normX;
        const auto y = bounds.getY() + bounds.getHeight() * (1.0f - normY);

        g.setColour (juce::Colours::white);
        g.fillEllipse (x - 5.0f, y - 5.0f, 10.0f, 10.0f);
        g.drawText ("Tongue Pad", getLocalBounds().reduced (10), juce::Justification::topLeft);
    }

    void mouseDown (const juce::MouseEvent& event) override
    {
        updateFromPosition (event.position);
    }

    void mouseDrag (const juce::MouseEvent& event) override
    {
        updateFromPosition (event.position);
    }

private:
    void updateFromPosition (juce::Point<float> position)
    {
        const auto bounds = getLocalBounds().toFloat().reduced (8.0f);
        const auto clamped = position.getClampedTo (bounds);
        const auto normX = juce::jlimit (0.0f, 1.0f, (clamped.x - bounds.getX()) / bounds.getWidth());
        const auto normY = juce::jlimit (0.0f, 1.0f, 1.0f - (clamped.y - bounds.getY()) / bounds.getHeight());

        setParamNormalized (tongueXParam, normX);
        setParamNormalized (tongueYParam, normY);
        repaint();
    }

    static float getParamNormalized (juce::RangedAudioParameter* param, float fallback)
    {
        return param != nullptr ? param->getValue() : fallback;
    }

    static void setParamNormalized (juce::RangedAudioParameter* param, float value)
    {
        if (param != nullptr)
            param->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, value));
    }

    OtonashiTractAudioProcessor& processorRef;
    juce::RangedAudioParameter* tongueXParam = nullptr;
    juce::RangedAudioParameter* tongueYParam = nullptr;
};

class TractTab final : public juce::Component
{
public:
    explicit TractTab (OtonashiTractAudioProcessor& processor)
        : processorRef (processor),
          pad (processor),
          tongueX ("Tongue X", processor.getValueTreeState(), ParamIDs::tongueX),
          tongueY ("Tongue Y", processor.getValueTreeState(), ParamIDs::tongueY),
          lips ("Lips", processor.getValueTreeState(), ParamIDs::lips),
          lipLen ("Lip Length", processor.getValueTreeState(), ParamIDs::lipLen),
          throat ("Throat", processor.getValueTreeState(), ParamIDs::throat),
          nasal ("Nasal", processor.getValueTreeState(), ParamIDs::nasal),
          breath ("Breath", processor.getValueTreeState(), ParamIDs::breath),
          gender ("Gender", processor.getValueTreeState(), ParamIDs::gender),
          intensity ("Intensity", processor.getValueTreeState(), ParamIDs::intensity)
    {
        addAndMakeVisible (pad);
        addAndMakeVisible (tongueX);
        addAndMakeVisible (tongueY);
        addAndMakeVisible (lips);
        addAndMakeVisible (lipLen);
        addAndMakeVisible (throat);
        addAndMakeVisible (nasal);
        addAndMakeVisible (breath);
        addAndMakeVisible (gender);
        addAndMakeVisible (intensity);
        addAndMakeVisible (formantLabel);
    }

    void resized() override
    {
        auto area = getLocalBounds().reduced (12);
        auto row = [&area]() { return area.removeFromTop (24).reduced (0, 2); };

        pad.setBounds (area.removeFromTop (180));
        area.removeFromTop (6);
        tongueX.setBounds (row());
        tongueY.setBounds (row());
        lips.setBounds (row());
        lipLen.setBounds (row());
        throat.setBounds (row());
        nasal.setBounds (row());
        breath.setBounds (row());
        gender.setBounds (row());
        intensity.setBounds (row());
        formantLabel.setBounds (row());
    }

    void updateFormants()
    {
        const auto formants = processorRef.getCurrentFormants();
        formantLabel.setText ("F1: " + juce::String (formants[0], 1)
                                  + "  F2: " + juce::String (formants[1], 1)
                                  + "  F3: " + juce::String (formants[2], 1),
                              juce::dontSendNotification);
        pad.repaint();
    }

private:
    OtonashiTractAudioProcessor& processorRef;
    TractPad pad;
    LabeledSlider tongueX;
    LabeledSlider tongueY;
    LabeledSlider lips;
    LabeledSlider lipLen;
    LabeledSlider throat;
    LabeledSlider nasal;
    LabeledSlider breath;
    LabeledSlider gender;
    LabeledSlider intensity;
    juce::Label formantLabel;
};
} // namespace

OtonashiTractAudioProcessorEditor::OtonashiTractAudioProcessorEditor (OtonashiTractAudioProcessor& processor)
    : juce::AudioProcessorEditor (processor),
      processorRef (processor)
{
    performTab = std::make_unique<PerformTab> (processorRef);
    analysisTab = std::make_unique<AnalysisTab> (processorRef);
    tractTab = std::make_unique<TractTab> (processorRef);

    tabs.addTab ("Perform", juce::Colours::darkslategrey, performTab.get(), true);
    tabs.addTab ("Analysis", juce::Colours::darkslategrey, analysisTab.get(), true);
    tabs.addTab ("Tract", juce::Colours::darkslategrey, tractTab.get(), true);

    addAndMakeVisible (tabs);
    addAndMakeVisible (footerLabel);
    footerLabel.setJustificationType (juce::Justification::right);
    footerLabel.setText ("Mono In / Mono Out", juce::dontSendNotification);

    setSize (520, 520);
    startTimerHz (10);
}

OtonashiTractAudioProcessorEditor::~OtonashiTractAudioProcessorEditor() = default;

void OtonashiTractAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colours::black);
}

void OtonashiTractAudioProcessorEditor::resized()
{
    auto area = getLocalBounds();
    footerLabel.setBounds (area.removeFromBottom (18).reduced (8, 0));
    tabs.setBounds (area.reduced (8));
}

void OtonashiTractAudioProcessorEditor::timerCallback()
{
    if (performTab)
        performTab->updateLiveAssist();

    if (analysisTab)
        analysisTab->updateStatus();

    if (tractTab)
        tractTab->updateFormants();
}
} // namespace otonashi
