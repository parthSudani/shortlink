$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$output = Join-Path (Get-Location) 'Short_Link_Service_Interview_Preparation.docx'
$lines = @'
TITLE|Short Link Service Interview Preparation
SUB|A functional and technical walkthrough of the implementation in this repository
P|Use this guide to explain what the running project does, how its main request paths work, and where the implementation differs from the recruiter's requested stack. Keep claims factual: this repository uses NestJS and React, not Spring Boot and Angular.
H1|1. A 60-second project explanation
Q|I built a URL short-link service with a React dashboard and a NestJS REST API. Users register, sign in, create links with optional aliases and expirations, and view analytics for links they own. PostgreSQL is the source of truth. Redis serves hot redirects and accepts click events into a stream so the redirect request does not wait for PostgreSQL analytics writes. A separate worker consumes events in batches, stores click records, and updates daily aggregates. I use random Base62 codes with a unique database constraint, JWT authentication, ownership-scoped queries, and destination validation that rejects non-HTTP(S) and private or reserved addresses. This is a working local implementation; the required Java/Angular stack conversion, public deployment, and measured load-test results remain to be done.
H1|2. Functional behavior
B|Register and log in. Emails are normalized to lowercase. Passwords are hashed with Argon2id. Login returns a signed JWT.
B|Create a short link. A user submits an HTTP(S) destination, optionally supplies a custom alias, and may set an expiry. The API validates the URL and expiry, applies a creation rate limit, and stores the link.
B|Share and follow a short link. Public GET /{code} returns HTTP 302. Unknown codes return 404; expired links return 410.
B|Review analytics. The owner sees total clicks, daily clicks for the last 30 days, top referrer hosts, and a coarse device split.
B|Manage links. Authenticated users list, inspect, and delete links they own. The dashboard supports copying a short URL.
H1|3. Architecture
P|Request path: Browser dashboard -> NestJS API -> PostgreSQL. For redirects, the API checks Redis first and falls back to PostgreSQL on a cache miss. It publishes a click event to a Redis Stream; a separate worker writes analytics to PostgreSQL.
B|Frontend: React 19, TypeScript, Vite, and React Router. Screens include login, registration, link listing, link creation, and per-link analytics. The API client attaches the access token from session storage.
B|API: NestJS controllers handle HTTP routes. Services implement authentication, link management, validation, cache, rate limiting, and click queue behavior. DTO validation and a global error filter provide input and error handling.
B|Storage: PostgreSQL stores users, links, click events, and daily aggregates. Sequelize models and explicit migrations manage the schema; automatic schema synchronization is disabled.
B|Redis: Stores redirect cache entries, rate-limit counters, click streams, retries, dead letters, and operational counters. The worker is a separate process built from the backend package.
H1|4. Main request flows
H2|Create link
P|POST /api/v1/links requires a verified JWT. The owner ID comes from the token, not the request body. The service applies a Redis fixed-window limit by account and IP, validates the destination and optional expiry, then inserts the link. A generated-code collision is retried up to five times; the unique index remains the concurrency-safe check.
H2|Redirect and click capture
P|GET /:code checks Redis for the destination and expiry. On a cache miss, it reads the required redirect fields from PostgreSQL and populates Redis. It rechecks expiry and returns 302. The API reduces the referrer to a hostname and parses the user-agent into a coarse device category, then enqueues a click event. The redirect does not wait for the worker's PostgreSQL insert, though it does await the Redis enqueue attempt.
H2|Analytics
P|Authenticated analytics routes verify that the link belongs to the caller. Summary queries count click events; the time-series route reads daily aggregates; referrer and device routes group click events over the selected period. Dashboard panels load independently and can show their own error and retry state.
H1|5. Data model and indexes
B|users: UUID primary key, unique normalized email, Argon2id password hash, timestamps.
B|links: UUID primary key, owner foreign key, unique short code, destination URL, optional expiry, timestamps. An owner plus creation-time index supports link listing.
B|click_events: UUID event ID, link foreign key, click time, referrer host, device category, and unique idempotency key. A link plus click-time index supports time-window queries.
B|daily_link_stats: one row per link and UTC day, with a composite primary key and click count. The worker upserts increments transactionally.
P|Foreign keys cascade deletes from users to their links, and from links to click events and daily aggregates. The dashboard list uses one grouped join to compute totals rather than a click-count query per link.
H1|6. Code generation and URL safety
P|Generated codes are eight characters selected with Node's cryptographic randomInt from a 62-character alphabet. There are 62^8 possible codes, about 218 trillion. Random codes avoid exposing creation order; a unique index and bounded retry handle collisions. The trade-off is probabilistic collision handling rather than a sequence that guarantees a new value.
P|Destination validation accepts only HTTP and HTTPS, rejects URL credentials, blocks localhost and local names, resolves DNS names, and rejects addresses that are not unicast. The service redirects to the stored destination; it does not fetch the destination. If link previews or server-side scans are added, protect against DNS rebinding and restrict outbound network access.
H1|7. Click delivery, cache behavior, and failures
B|The API adds click events to a Redis Stream. A consumer group lets the worker read batches and claim old pending entries after an idle interval.
B|The worker bulk-inserts events with a unique event key and updates daily totals in the same PostgreSQL transaction. It acknowledges and removes stream entries only after persistence succeeds.
B|Transient processing failures are rescheduled with capped exponential backoff. After the configured maximum attempts, events go to a dead-letter stream.
B|Cache failures fall back to PostgreSQL. Queue enqueue failure is fail-open: the redirect succeeds, but the click may be lost. Redis persistence is configured, but Redis alone does not guarantee zero data loss.
B|Cache entries have a bounded TTL (one hour by default), shortened to the link expiry when applicable. Link deletion invalidates the cached code.
H1|8. Security and ownership
B|JWTs use HS256 and are checked for issuer and audience. Access tokens expire after 15 minutes by default. The frontend stores tokens in sessionStorage, which limits persistence but remains accessible to injected same-origin JavaScript.
B|Passwords use Argon2id. Login failures are rate-limited by IP; link creation is limited by account and IP through Redis.
B|Every link read, analytics request, and delete is scoped by the authenticated owner's ID. A missing or non-owned link returns not found.
B|Analytics retain referrer hostname and coarse device category. The raw user-agent string is parsed and discarded.
H1|9. How I would discuss scale
P|At 10 million links and 1,000 redirects per second, I would measure cache hit rate, redirect p95 and p99, database and Redis latency, queue depth, oldest event age, dropped events, and worker throughput. This architecture separates the read-heavy redirect path from analytics persistence, but scale claims require measurements on a stated machine and workload.
B|Keep hot redirects cached and size Redis for the working set. Use connection pooling and monitor latency, memory, and eviction behavior.
B|Scale stateless API instances horizontally behind a load balancer. Use managed PostgreSQL or a properly operated primary/replica setup, connection pooling, and partitioning or retention for high-volume click events.
B|Scale workers independently and tune batch size and concurrency using queue age and database capacity. A durable managed queue or carefully operated Redis deployment can improve delivery guarantees.
B|Compare k6 runs with cache on and bypassed. Report p95, requests per second, error rate, cache hit rate, duration, VUs, and machine/container limits. Do not present unmeasured numbers as results.
P|Current status: the repository includes a k6 script and a results table template, but no benchmark has been run. It exposes JSON health and metrics endpoints; it does not currently include Prometheus or Grafana.
H1|10. API routes to know
B|POST /api/v1/auth/register and POST /api/v1/auth/login. GET /api/v1/auth/me requires a bearer token.
B|POST /api/v1/links creates. GET /api/v1/links lists with pagination. GET /api/v1/links/:id reads one owned link. DELETE /api/v1/links/:id deletes it.
B|GET /api/v1/links/:id/analytics/summary, /clicks, /referrers, and /devices provide analytics to the owner.
B|GET /:code is public and redirects. /health/live checks process liveness; /health/ready checks PostgreSQL, Redis, and worker heartbeat; /health/metrics returns operational counters.
B|Swagger UI is available at http://localhost:3000/api/docs when the local stack is running.
H1|11. Likely recruiter questions
H2|Why random Base62 codes instead of a sequence?
P|Random codes avoid exposing link volume or creation order and make casual enumeration harder. The unique index is authoritative, and I retry collisions. A sequence simplifies uniqueness and may allow compact codes, but reveals ordering and needs a separate encoding strategy.
H2|How do you keep analytics writes from slowing redirects?
P|The API records the event in Redis and a separate worker batches database writes. The redirect does wait for the Redis enqueue operation, so it avoids waiting for PostgreSQL analytics persistence, but it is not literally zero-cost. If enqueue fails, the redirect proceeds and the click can be lost.
H2|What delivery guarantee do you provide?
P|The worker uses a Redis consumer group, pending-entry recovery, idempotent inserts, retries, and a dead-letter stream. This supports at-least-once processing with idempotent persistence under normal Redis durability assumptions. It does not promise zero loss if Redis data is lost or enqueue fails.
H2|How do you prevent users from viewing each other's analytics?
P|The JWT guard verifies the token and puts its subject on the request. Link and analytics queries include both the requested link ID and that owner's ID. A missing or non-owned link returns not found.
H2|What did you measure?
P|I have not run the k6 benchmark yet, so I will not quote a p95 or throughput result. I would run the same workload with cache enabled and bypassed, then report p95, requests per second, errors, cache hit rate, and resource limits.
H1|12. Be transparent about assessment gaps
B|The recruiter requested Java 17+ with Spring Boot and Angular. This repository currently uses NestJS and React. The architecture concepts transfer, but this implementation does not satisfy the stated framework constraint.
B|There is no public HTTPS deployment or seeded demo account provisioned yet.
B|CI and PostgreSQL Testcontainers integration coverage are present in the repository. Do not claim a passing CI run unless it has actually been run or observed.
B|The load-test script exists, but benchmark results are empty because no run has been completed.
B|The brief asks to record user-agent data. This implementation parses the user-agent only to determine a coarse device type and discards the raw string.
P|A credible answer is: Those are the remaining deliverables. If the stack requirement is strict, I would port the API to Spring Boot and the UI to Angular, run CI, deploy with environment-based secrets, create a demo account, and capture reproducible k6 results.
H1|13. Five-minute demo sequence
B|Show registration and login; explain JWT authentication and ownership checks.
B|Create a link to a public HTTPS destination, optionally adding an alias or expiry, and point out destination validation.
B|Open the short URL in a new tab and show the 302 redirect.
B|Return to the dashboard, refresh after the worker processes the event, and open analytics.
B|Explain the Redis cache hit path and asynchronous click stream, then show /health/ready and /health/metrics.
B|Close by distinguishing measured from unmeasured performance and naming the Spring Boot and Angular conversion as remaining work.
'@ -split "`r?`n"

function Escape-Xml([string]$value) { [System.Security.SecurityElement]::Escape($value) }
function Make-Paragraph([string]$kind, [string]$text) {
  $size = 21; $color = '263345'; $bold = ''; $before = 0; $after = 100; $keep = ''
  switch ($kind) {
    'TITLE' { $size = 52; $color = '17365D'; $bold = '<w:b/>'; $after = 60; $before = 0; $keep = '<w:keepNext/>' }
    'SUB' { $size = 24; $color = '52677F'; $after = 260; $keep = '<w:keepNext/>' }
    'H1' { $size = 32; $color = '17365D'; $bold = '<w:b/>'; $before = 220; $after = 80; $keep = '<w:keepNext/>' }
    'H2' { $size = 23; $color = '275B83'; $bold = '<w:b/>'; $before = 140; $after = 50; $keep = '<w:keepNext/>' }
    'B' { $text = '- ' + $text; $after = 65 }
    'Q' { $size = 22; $color = '334E68'; $after = 170; $before = 40 }
  }
  $safe = Escape-Xml $text
  $ppr = "<w:pPr><w:spacing w:before=`"$before`" w:after=`"$after`" w:line=`"270`" w:lineRule=`"auto`"/>$keep</w:pPr>"
  $rpr = "<w:rPr><w:rFonts w:ascii=`"Aptos`" w:hAnsi=`"Aptos`"/><w:color w:val=`"$color`"/><w:sz w:val=`"$size`"/><w:szCs w:val=`"$size`"/>$bold</w:rPr>"
  return "<w:p>$ppr<w:r>$rpr<w:t xml:space=`"preserve`">$safe</w:t></w:r></w:p>"
}

$body = ''
foreach ($line in $lines) {
  if (-not $line) { continue }
  $pair = $line -split '\|', 2
  if ($pair.Count -eq 2) { $body += Make-Paragraph $pair[0] $pair[1] }
}
$section = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr>'
$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + $body + $section + '</w:body></w:document>'
$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
$rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$utf8 = New-Object System.Text.UTF8Encoding($false)
if (Test-Path $output) { Remove-Item -LiteralPath $output -Force }
$archive = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($entryData in @(@{Name='[Content_Types].xml';Text=$contentTypes}, @{Name='_rels/.rels';Text=$rootRels}, @{Name='word/document.xml';Text=$documentXml})) {
    $entry = $archive.CreateEntry($entryData.Name)
    $stream = $entry.Open()
    $bytes = $utf8.GetBytes($entryData.Text)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Dispose()
  }
} finally { $archive.Dispose() }
Get-Item $output | Select-Object FullName,Length
