#pragma once

#include "OtonashiTypes.h"

namespace otonashi
{
class EnvelopeState
{
public:
    void clear()
    {
        lanes.clear();
    }

    bool isEmpty() const noexcept
    {
        return lanes.isEmpty();
    }

    void setLane (const EnvelopeLane& lane)
    {
        for (int i = 0; i < lanes.size(); ++i)
        {
            if (lanes.getReference (i).id == lane.id)
            {
                lanes.getReference (i) = lane;
                return;
            }
        }

        lanes.add (lane);
    }

    const EnvelopeLane* getLane (const juce::String& id) const noexcept
    {
        for (const auto& lane : lanes)
            if (lane.id == id)
                return &lane;

        return nullptr;
    }

    float evaluate (const juce::String& id, double timeSeconds, float fallback) const
    {
        if (const auto* lane = getLane (id))
            return lane->evaluate (timeSeconds);

        return fallback;
    }

    double getDurationSeconds() const noexcept
    {
        double duration = 0.0;
        for (const auto& lane : lanes)
            duration = juce::jmax (duration, lane.getDurationSeconds());
        return duration;
    }

    int getLaneCount() const noexcept
    {
        return lanes.size();
    }

    juce::ValueTree toValueTree() const
    {
        juce::ValueTree stateTree ("EnvelopeState");
        for (const auto& lane : lanes)
            stateTree.addChild (lane.toValueTree(), -1, nullptr);
        return stateTree;
    }

    static EnvelopeState fromValueTree (const juce::ValueTree& tree)
    {
        EnvelopeState state;
        for (int i = 0; i < tree.getNumChildren(); ++i)
        {
            const auto laneTree = tree.getChild (i);
            if (! laneTree.hasType ("Lane"))
                continue;

            state.setLane (EnvelopeLane::fromValueTree (laneTree));
        }

        return state;
    }

    juce::Array<EnvelopeLane> getAllLanes() const
    {
        return lanes;
    }

private:
    juce::Array<EnvelopeLane> lanes;
};
} // namespace otonashi
