using System.Globalization;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Otonashi.OpenUtauAdapterPrototype;

public sealed class OtonashiVowelClient : IDisposable {
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) {
        WriteIndented = false,
    };

    private readonly HttpClient _http;
    private readonly bool _ownsHttpClient;

    public OtonashiVowelClient(Uri baseUri, TimeSpan timeout) {
        _http = new HttpClient {
            BaseAddress = baseUri,
            Timeout = timeout,
        };
        _ownsHttpClient = true;
    }

    public OtonashiVowelClient(HttpClient httpClient) {
        _http = httpClient;
        _ownsHttpClient = false;
    }

    public async Task<OtonashiHealth> GetHealthAsync(CancellationToken cancellationToken = default) {
        using var response = await _http.GetAsync("health", cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var health = await response.Content.ReadFromJsonAsync<OtonashiHealth>(JsonOptions, cancellationToken).ConfigureAwait(false);
        if (health is null) {
            throw new InvalidOperationException("Otonashi health response was empty.");
        }
        return health;
    }

    public async Task<string> GetPlanJsonAsync(VowelOnlyRenderRequest request, CancellationToken cancellationToken = default) {
        using var response = await PostJsonAsync("v1/plan/vowel-only", request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<OtonashiRenderResponse> RenderVowelOnlyAsync(
        VowelOnlyRenderRequest request,
        CancellationToken cancellationToken = default
    ) {
        using var response = await PostJsonAsync("v1/render/vowel-only", request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var mediaType = response.Content.Headers.ContentType?.MediaType;
        if (!string.Equals(mediaType, "audio/wav", StringComparison.OrdinalIgnoreCase)) {
            throw new InvalidOperationException($"Expected audio/wav, got {mediaType ?? "(none)"}.");
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        if (bytes.Length < 44 || Encoding.ASCII.GetString(bytes, 0, 4) != "RIFF" || Encoding.ASCII.GetString(bytes, 8, 4) != "WAVE") {
            throw new InvalidOperationException("Render response was not a valid RIFF/WAVE payload.");
        }

        return new OtonashiRenderResponse(
            bytes,
            new OtonashiRenderDiagnostics(
                ReadHeaderInt(response, "x-otonashi-frame-count"),
                ReadHeaderDouble(response, "x-otonashi-duration-sec"),
                ReadHeaderDouble(response, "x-otonashi-peak"),
                ReadHeaderDouble(response, "x-otonashi-rms"),
                ReadHeaderDouble(response, "x-otonashi-limiter-gain-db")
            )
        );
    }

    private async Task<HttpResponseMessage> PostJsonAsync(
        string path,
        VowelOnlyRenderRequest request,
        CancellationToken cancellationToken
    ) {
        var json = JsonSerializer.Serialize(request, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        return await _http.PostAsync(path, content, cancellationToken).ConfigureAwait(false);
    }

    private static int ReadHeaderInt(HttpResponseMessage response, string headerName) {
        var raw = ReadHeader(response, headerName);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private static double ReadHeaderDouble(HttpResponseMessage response, string headerName) {
        var raw = ReadHeader(response, headerName);
        return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private static string ReadHeader(HttpResponseMessage response, string headerName) {
        return response.Headers.TryGetValues(headerName, out var values) ? values.FirstOrDefault() ?? string.Empty : string.Empty;
    }

    public void Dispose() {
        if (_ownsHttpClient) {
            _http.Dispose();
        }
    }
}
