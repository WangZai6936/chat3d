# CI-only loopback gateway. HTTP.sys shares port 80 with the runner's IIS.
# Registers only the isolated team API; does not alter URL ACLs or services.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This gateway is only for the disposable CI runner.' }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:80/api/team/')
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseProxy = $false
$client = [System.Net.Http.HttpClient]::new($handler)
try {
  $listener.Start()
  Write-Output 'Isolated HTTP.sys gateway ready'
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $incoming = $context.Request
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($incoming.HttpMethod), ('http://127.0.0.1:1435' + $incoming.RawUrl))
    try {
      if ($incoming.HasEntityBody) {
        $memory = [System.IO.MemoryStream]::new()
        $incoming.InputStream.CopyTo($memory)
        $request.Content = [System.Net.Http.ByteArrayContent]::new($memory.ToArray())
        $memory.Dispose()
        if ($incoming.ContentType) { $request.Content.Headers.TryAddWithoutValidation('Content-Type', $incoming.ContentType) | Out-Null }
      }
      foreach ($name in @('Authorization', 'Origin')) {
        if ($incoming.Headers[$name]) { $request.Headers.TryAddWithoutValidation($name, $incoming.Headers[$name]) | Out-Null }
      }
      $upstream = $client.SendAsync($request).GetAwaiter().GetResult()
      $bytes = $upstream.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      $context.Response.StatusCode = [int]$upstream.StatusCode
      $context.Response.ContentType = 'application/json'
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $upstream.Dispose()
    } catch {
      Write-Error $_ -ErrorAction Continue
      $context.Response.StatusCode = 502
    } finally {
      $request.Dispose()
      $context.Response.Close()
    }
  }
} finally {
  $listener.Close()
  $client.Dispose()
}
