using System.Text.Json;
using Otonashi.OpenUtauAdapterPrototype;

var options = CliOptions.Parse(args);
if (options.ShowHelp) {
    CliOptions.PrintHelp();
    return 0;
}

var request = await LoadRequestAsync(options.InputPath).ConfigureAwait(false);
using var client = new OtonashiVowelClient(options.BaseUrl, TimeSpan.FromMilliseconds(options.TimeoutMs));
using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(options.TimeoutMs + 1000));

try {
    var health = await client.GetHealthAsync(cts.Token).ConfigureAwait(false);
    if (!health.Ok) {
        throw new InvalidOperationException("Otonashi service did not report ok=true.");
    }

    if (options.PlanOnly) {
        var planJson = await client.GetPlanJsonAsync(request, cts.Token).ConfigureAwait(false);
        Console.WriteLine(planJson);
        return 0;
    }

    var render = await client.RenderVowelOnlyAsync(request, cts.Token).ConfigureAwait(false);
    var outputPath = Path.GetFullPath(options.OutputPath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
    await File.WriteAllBytesAsync(outputPath, render.WavBytes, cts.Token).ConfigureAwait(false);

    Console.WriteLine(JsonSerializer.Serialize(new {
        ok = true,
        output = outputPath,
        bytes = render.WavBytes.Length,
        diagnostics = render.Diagnostics,
        service = health.Service,
        version = health.Version,
    }, new JsonSerializerOptions { WriteIndented = true }));
    return 0;
}
catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException) {
    Console.Error.WriteLine(JsonSerializer.Serialize(new {
        ok = false,
        fallbackRecommended = true,
        error = ex.Message,
    }, new JsonSerializerOptions { WriteIndented = true }));
    return 2;
}

static async Task<VowelOnlyRenderRequest> LoadRequestAsync(string inputPath) {
    var fullPath = Path.GetFullPath(inputPath);
    await using var stream = File.OpenRead(fullPath);
    var request = await JsonSerializer.DeserializeAsync<VowelOnlyRenderRequest>(
        stream,
        new JsonSerializerOptions(JsonSerializerDefaults.Web)
    ).ConfigureAwait(false);
    return request ?? throw new InvalidOperationException($"Failed to read request JSON: {fullPath}");
}

internal sealed record CliOptions(
    Uri BaseUrl,
    string InputPath,
    string OutputPath,
    int TimeoutMs,
    bool PlanOnly,
    bool ShowHelp
) {
    public static CliOptions Parse(string[] args) {
        var baseUrl = new Uri("http://127.0.0.1:38240/");
        var input = Path.Combine("examples", "vowel-note.json");
        var output = Path.Combine("out", "openutau-adapter-vowel.wav");
        var timeoutMs = 5000;
        var planOnly = false;
        var showHelp = false;

        for (var i = 0; i < args.Length; i++) {
            var arg = args[i];
            switch (arg) {
                case "--base-url":
                    baseUrl = new Uri(EnsureTrailingSlash(RequireValue(args, ++i, arg)));
                    break;
                case "--input":
                case "-i":
                    input = RequireValue(args, ++i, arg);
                    break;
                case "--output":
                case "-o":
                    output = RequireValue(args, ++i, arg);
                    break;
                case "--timeout-ms":
                    timeoutMs = int.Parse(RequireValue(args, ++i, arg));
                    break;
                case "--plan-only":
                    planOnly = true;
                    break;
                case "--help":
                case "-h":
                    showHelp = true;
                    break;
            }
        }

        return new CliOptions(baseUrl, input, output, timeoutMs, planOnly, showHelp);
    }

    public static void PrintHelp() {
        Console.WriteLine("""
        Otonashi OpenUtau adapter prototype

        Usage:
          dotnet run --project prototypes/openutau-adapter -- --base-url http://127.0.0.1:38240 --input examples\vowel-note.json --output out\openutau-adapter-vowel.wav

        Options:
          --base-url      Otonashi vowel engine base URL. Default: http://127.0.0.1:38240/
          --input, -i     Request JSON path. Default: examples\vowel-note.json
          --output, -o    WAV output path. Default: out\openutau-adapter-vowel.wav
          --timeout-ms    HTTP timeout in milliseconds. Default: 5000
          --plan-only     Print JSON plan instead of rendering WAV.
        """);
    }

    private static string RequireValue(string[] args, int index, string optionName) {
        if (index >= args.Length) {
            throw new ArgumentException($"{optionName} requires a value.");
        }
        return args[index];
    }

    private static string EnsureTrailingSlash(string value) {
        return value.EndsWith("/", StringComparison.Ordinal) ? value : value + "/";
    }
}
