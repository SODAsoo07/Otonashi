using System.Text.Json.Serialization;

namespace Otonashi.OpenUtauAdapterPrototype;

public sealed record EngineNote {
    [JsonPropertyName("id")]
    public string? Id { get; init; }

    [JsonPropertyName("lyric")]
    public required string Lyric { get; init; }

    [JsonPropertyName("tone")]
    public double? Tone { get; init; }

    [JsonPropertyName("pitchHz")]
    public double? PitchHz { get; init; }

    [JsonPropertyName("durationMs")]
    public required double DurationMs { get; init; }

    [JsonPropertyName("velocity")]
    public double? Velocity { get; init; }
}

public sealed record TractState {
    [JsonPropertyName("x")]
    public double X { get; init; } = 0.5;

    [JsonPropertyName("y")]
    public double Y { get; init; } = 0.4;

    [JsonPropertyName("lips")]
    public double Lips { get; init; } = 0.7;

    [JsonPropertyName("lipLen")]
    public double LipLen { get; init; } = 0.5;

    [JsonPropertyName("throat")]
    public double Throat { get; init; } = 0.5;

    [JsonPropertyName("nasal")]
    public double Nasal { get; init; } = 0.2;

    [JsonPropertyName("gender")]
    public double Gender { get; init; } = 1.0;

    [JsonPropertyName("gain")]
    public double Gain { get; init; } = 0.25;
}

public sealed record RendererSettings {
    [JsonPropertyName("waveform")]
    public string? Waveform { get; init; } = "sawtooth";

    [JsonPropertyName("attackMs")]
    public double? AttackMs { get; init; } = 8;

    [JsonPropertyName("releaseMs")]
    public double? ReleaseMs { get; init; } = 35;

    [JsonPropertyName("formantAmount")]
    public double? FormantAmount { get; init; } = 1.0;

    [JsonPropertyName("vowelTargetAmount")]
    public double? VowelTargetAmount { get; init; } = 0.2;
}

public sealed record VowelOnlyRenderRequest {
    [JsonPropertyName("schemaVersion")]
    public string? SchemaVersion { get; init; } = "vowel-only-0.1";

    [JsonPropertyName("sampleRate")]
    public int? SampleRate { get; init; } = 44100;

    [JsonPropertyName("seed")]
    public int? Seed { get; init; } = 1;

    [JsonPropertyName("notes")]
    public required IReadOnlyList<EngineNote> Notes { get; init; }

    [JsonPropertyName("tract")]
    public TractState? Tract { get; init; }

    [JsonPropertyName("renderer")]
    public RendererSettings? Renderer { get; init; }
}

public sealed record OtonashiHealth(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("service")] string? Service,
    [property: JsonPropertyName("version")] string? Version
);

public sealed record OtonashiRenderDiagnostics(
    int FrameCount,
    double DurationSec,
    double Peak,
    double Rms,
    double LimiterGainDb
);

public sealed record OtonashiRenderResponse(
    byte[] WavBytes,
    OtonashiRenderDiagnostics Diagnostics
);
