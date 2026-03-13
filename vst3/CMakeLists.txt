cmake_minimum_required(VERSION 3.22)

project(OtonashiTractVST VERSION 0.1.0 LANGUAGES CXX)

include(FetchContent)

FetchContent_Declare(
    juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.7
)

FetchContent_MakeAvailable(juce)

juce_add_plugin(OtonashiTract
    COMPANY_NAME "Otonashi"
    BUNDLE_ID "com.otonashi.tractvst"
    PLUGIN_MANUFACTURER_CODE Otnh
    PLUGIN_CODE OTrc
    PRODUCT_NAME "OTONASHI Tract"
    FORMATS VST3
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
)

target_sources(OtonashiTract
    PRIVATE
        src/AnalysisEngine.cpp
        src/PluginEditor.cpp
        src/PluginProcessor.cpp
)

target_include_directories(OtonashiTract PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_features(OtonashiTract PRIVATE cxx_std_20)

target_compile_definitions(OtonashiTract
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        JUCE_REPORT_APP_USAGE=0
)

target_link_libraries(OtonashiTract
    PRIVATE
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_formats
        juce::juce_audio_plugin_client
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_basics
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

juce_generate_juce_header(OtonashiTract)
