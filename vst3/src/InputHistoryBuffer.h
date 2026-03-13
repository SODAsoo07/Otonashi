#pragma once

#include <atomic>
#include <vector>

#include <JuceHeader.h>

namespace otonashi
{
class InputHistoryBuffer
{
public:
    void prepare (double newSampleRate, int maxSeconds = 10)
    {
        const juce::SpinLock::ScopedLockType guard (lock);
        sampleRate = juce::jmax (1.0, newSampleRate);
        capacity = juce::jmax (1, static_cast<int> (std::round (sampleRate * maxSeconds)));
        ring.assign (static_cast<size_t> (capacity), 0.0f);
        writeIndex.store (0);
        filledSamples.store (0);
    }

    void push (const juce::AudioBuffer<float>& monoBuffer) noexcept
    {
        if (monoBuffer.getNumChannels() == 0 || capacity == 0)
            return;

        push (monoBuffer.getReadPointer (0), monoBuffer.getNumSamples());
    }

    void push (const float* samples, int numSamples) noexcept
    {
        if (samples == nullptr || numSamples <= 0 || capacity == 0)
            return;

        const juce::SpinLock::ScopedTryLockType guard (lock);
        if (! guard.isLocked())
            return;

        auto localWrite = writeIndex.load (std::memory_order_relaxed);

        for (int i = 0; i < numSamples; ++i)
        {
            ring[static_cast<size_t> (localWrite)] = samples[i];
            localWrite = (localWrite + 1) % capacity;
        }

        writeIndex.store (localWrite, std::memory_order_release);
        filledSamples.store (juce::jmin (capacity, filledSamples.load (std::memory_order_acquire) + numSamples), std::memory_order_release);
    }

    juce::AudioBuffer<float> copyLatestWindow (double seconds) const
    {
        const juce::SpinLock::ScopedLockType guard (lock);
        const auto available = filledSamples.load (std::memory_order_acquire);
        const auto requestedSamples = juce::jlimit (0, available, static_cast<int> (std::round (seconds * sampleRate)));

        juce::AudioBuffer<float> snapshot (1, juce::jmax (1, requestedSamples));
        snapshot.clear();

        if (requestedSamples <= 0 || capacity == 0)
            return snapshot;

        const auto endIndex = writeIndex.load (std::memory_order_acquire);
        const auto startIndex = (endIndex - requestedSamples + capacity) % capacity;
        auto* dest = snapshot.getWritePointer (0);

        for (int i = 0; i < requestedSamples; ++i)
            dest[i] = ring[static_cast<size_t> ((startIndex + i) % capacity)];

        return snapshot;
    }

    double getAvailableDurationSeconds() const noexcept
    {
        return static_cast<double> (filledSamples.load (std::memory_order_acquire)) / sampleRate;
    }

private:
    double sampleRate = 44100.0;
    int capacity = 0;
    std::vector<float> ring;
    std::atomic<int> writeIndex { 0 };
    std::atomic<int> filledSamples { 0 };
    mutable juce::SpinLock lock;
};
} // namespace otonashi
