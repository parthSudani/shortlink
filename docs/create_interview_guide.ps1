$ErrorActionPreference = 'Stop'
$debugLog = Join-Path $env:TEMP 'shortlink_interview_guide_debug.log'
Set-Content -LiteralPath $debugLog -Value 'start'
trap { Add-Content -LiteralPath $debugLog -Value ('ERROR ' + $_.Exception.ToString()); break }
$output = Join-Path (Get-Location) 'Short_Link_Service_Interview_Preparation.docx'
$pdf = Join-Path $env:TEMP 'Short_Link_Service_Interview_Preparation_QA.pdf'
$word = New-Object -ComObject Word.Application
$null = Add-Content -LiteralPath $debugLog -Value 'word created'
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()
$null = Add-Content -LiteralPath $debugLog -Value 'document created'
$sel = $word.Selection
$section = $doc.Sections.Item(1)
$section.PageSetup.TopMargin = $word.InchesToPoints(0.68)
$section.PageSetup.BottomMargin = $word.InchesToPoints(0.68)
$section.PageSetup.LeftMargin = $word.InchesToPoints(0.78)
$section.PageSetup.RightMargin = $word.InchesToPoints(0.78)
$normal = $doc.Styles.Item('Normal')
$normal.Font.Name = 'Aptos'
$normal.Font.Size = 10
$normal.Font.Color = 0x263345
$normal.ParagraphFormat.SpaceAfter = 5
$normal.ParagraphFormat.LineSpacingRule = 0
$titleStyle = $doc.Styles.Item('Title')
$titleStyle.Font.Name = 'Aptos Display'
$titleStyle.Font.Size = 27
$titleStyle.Font.Bold = $true
$titleStyle.Font.Color = 0x17365D
$titleStyle.ParagraphFormat.SpaceAfter = 3
$subtitleStyle = $doc.Styles.Item('Subtitle')
$subtitleStyle.Font.Name = 'Aptos'
$subtitleStyle.Font.Size = 12
$subtitleStyle.Font.Color = 0x52677F
$subtitleStyle.ParagraphFormat.SpaceAfter = 18
foreach ($name in @('Heading 1','Heading 2')) {
  $style = $doc.Styles.Item($name)
  $style.Font.Name = 'Aptos Display'
  $style.Font.Bold = $true
  $style.Font.Color = 0x17365D
  $style.ParagraphFormat.KeepWithNext = $true
}
$doc.Styles.Item('Heading 1').Font.Size = 16
$doc.Styles.Item('Heading 1').ParagraphFormat.SpaceBefore = 12
$doc.Styles.Item('Heading 1').ParagraphFormat.SpaceAfter = 5
$doc.Styles.Item('Heading 2').Font.Size = 11
$doc.Styles.Item('Heading 2').ParagraphFormat.SpaceBefore = 7
$doc.Styles.Item('Heading 2').ParagraphFormat.SpaceAfter = 3

function Add-Para([string]$text, [string]$style = 'Normal') {
  $script:sel.Font.Name = 'Aptos'
  $script:sel.Font.Size = 10
  $script:sel.Font.Bold = $false
  $script:sel.Font.Color = 0x263345
  $script:sel.ParagraphFormat.SpaceBefore = 0
  $script:sel.ParagraphFormat.SpaceAfter = 5
  if ($style -eq 'Heading 1') {
    $script:sel.Font.Name = 'Aptos Display'
    $script:sel.Font.Size = 16
    $script:sel.Font.Bold = $true
    $script:sel.Font.Color = 0x17365D
    $script:sel.ParagraphFormat.SpaceBefore = 12
    $script:sel.ParagraphFormat.SpaceAfter = 5
    $script:sel.ParagraphFormat.KeepWithNext = $true
  } elseif ($style -eq 'Heading 2') {
    $script:sel.Font.Name = 'Aptos Display'
    $script:sel.Font.Size = 11
    $script:sel.Font.Bold = $true
    $script:sel.Font.Color = 0x17365D
    $script:sel.ParagraphFormat.SpaceBefore = 7
    $script:sel.ParagraphFormat.SpaceAfter = 3
    $script:sel.ParagraphFormat.KeepWithNext = $true
  }
  $script:sel.TypeText($text)
  $script:sel.TypeParagraph()
}
function Add-Bullet([string]$text) {
  $script:sel.Font.Name = 'Aptos'
  $script:sel.Font.Size = 10
  $script:sel.Font.Bold = $false
  $script:sel.Font.Color = 0x263345
  $script:sel.ParagraphFormat.LeftIndent = $script:word.InchesToPoints(0.22)
  $script:sel.ParagraphFormat.FirstLineIndent = -$script:word.InchesToPoints(0.17)
  $script:sel.TypeText([char]0x2022 + '  ' + $text)
  $script:sel.TypeParagraph()
  $script:sel.ParagraphFormat.LeftIndent = 0
  $script:sel.ParagraphFormat.FirstLineIndent = 0
}
function Add-Heading([string]$text, [int]$level = 1) {
  Add-Para $text ('Heading ' + $level)
}

$sel.Style = $doc.Styles.Item('Title')
$sel.TypeText('Short Link Service Interview Preparation')
$sel.TypeParagraph()
$sel.Style = $doc.Styles.Item('Subtitle')
$sel.TypeText('A functional and technical walkthrough of the implementation in this repository')
$sel.TypeParagraph()
Add-Para 'Use this guide to explain what the running project does, how its main request paths work, and where the current implementation differs from the recruiter''s requested stack. Keep claims tied to the code: this project is a NestJS and React implementation, not a Spring Boot and Angular implementation.'

Add-Heading '1. A 60-second project explanation'
Add-Para 'I built a URL short-link service with a React dashboard and a NestJS REST API. Users register, sign in, create links with optional aliases and expirations, and view analytics for links they own. PostgreSQL is the source of truth. Redis serves hot redirects and accepts click events into a stream so the redirect request does not wait for PostgreSQL analytics writes. A separate worker consumes events in batches, stores raw click records, and updates daily aggregates. I use random Base62 codes with a unique database constraint, JWT authentication, ownership-scoped queries, and destination validation that rejects non-HTTP(S) and private or reserved addresses. The current code is a working local implementation; it still needs the required Java/Angular stack conversion, a public deployment, and measured load-test results before I can claim those deliverables.'

Add-Heading '2. What a user can do'
Add-Bullet 'Register and log in. Emails are normalized to lowercase. Passwords are hashed with Argon2id; the API returns a signed JWT after registration or successful login.'
Add-Bullet 'Create a short link. The user submits an HTTP(S) destination, optionally supplies a custom alias, and may set an expiry. The API validates the URL and expiry, applies a creation rate limit, then stores the link.'
Add-Bullet 'Share and follow a short link. A public GET /{code} looks up the code and returns a 302 redirect. Unknown codes return 404; expired links return 410.'
Add-Bullet 'Review analytics. The owner sees total clicks, daily clicks for the last 30 days, top referrer hosts, and a coarse device split.'
Add-Bullet 'Manage links. Authenticated users list, inspect, and delete only links belonging to their account. The dashboard supports copying the short URL.'

Add-Heading '3. Architecture and component responsibilities'
Add-Para 'Request path: Browser dashboard -> NestJS API -> PostgreSQL. For redirects, NestJS checks Redis first and falls back to PostgreSQL on a cache miss. It publishes a click event to a Redis Stream; the separate worker writes analytics to PostgreSQL.'
Add-Para 'Frontend: React 19, TypeScript, Vite, and React Router. The UI includes login and registration, link listing, link creation, and per-link analytics. API requests attach the access token from session storage.'
Add-Para 'API: NestJS controllers handle HTTP routes; services implement link, auth, validation, cache, rate-limit, and queue behavior. DTO validation and a global error filter provide request validation and consistent error responses.'
Add-Para 'Storage: PostgreSQL stores users, links, click events, and daily aggregates. Sequelize models and explicit migrations manage the schema; automatic schema synchronization is disabled.'
Add-Para 'Cache and queue: Redis stores short-lived redirect entries, rate-limit counters, click streams, retries, dead letters, and operational counters. The worker is a separate process built from the backend package.'

Add-Heading '4. The important request flows'
Add-Heading 'Create link', 2
Add-Para 'The authenticated POST /api/v1/links route gets the owner ID from the verified JWT. The service applies a Redis fixed-window limit by account and IP, validates the destination and optional expiry, then inserts the link. A random code collision is retried up to five times; the unique index remains the final concurrency-safe check.'
Add-Heading 'Redirect and click capture', 2
Add-Para 'GET /:code checks Redis for the destination and expiry. On a cache miss, the API reads the minimal redirect fields from PostgreSQL and populates Redis. It rechecks expiry and responds with 302. It parses the referrer into a hostname and the user-agent into a coarse device category, then enqueues a click event. The redirect path does not wait for the worker''s PostgreSQL insert, although it does await the Redis enqueue attempt.'
Add-Heading 'Analytics', 2
Add-Para 'Authenticated analytics routes first verify that the requested link belongs to the caller. Summary queries count raw click events; the time-series endpoint reads the daily aggregate table; referrer and device endpoints group click events over the requested period. The dashboard loads these panels independently so one failed panel can show an error and retry without hiding the others.'

Add-Heading '5. Data model and indexes'
Add-Bullet 'users: UUID primary key, unique normalized email, Argon2id password hash, and timestamps.'
Add-Bullet 'links: UUID primary key, owner foreign key, unique short code, destination URL, optional expiry, and timestamps. An owner plus creation-time index supports the dashboard list.'
Add-Bullet 'click_events: UUID event ID, link foreign key, click time, referrer host, device category, and unique idempotency key. A link plus click-time index supports time-window queries.'
Add-Bullet 'daily_link_stats: one row per link and UTC day, with a composite primary key and a click count. The worker upserts increments transactionally.'
Add-Para 'Foreign keys cascade deletes from a user to links and from a link to its click data and aggregates. The dashboard list uses a grouped join to compute click totals in one query rather than issuing one click-count query per link.'

Add-Heading '6. Code generation and URL safety'
Add-Para 'Generated aliases are eight characters chosen with Node''s cryptographic randomInt from a 62-character alphabet. This gives 62^8 possible codes (about 218 trillion). Random codes avoid exposing creation order; the unique index plus bounded retry handles collisions. The trade-off is probabilistic collision handling rather than a sequence that guarantees a new number.'
Add-Para 'Destination validation accepts only HTTP and HTTPS, rejects URL credentials, blocks localhost/local names, resolves DNS names, and rejects addresses that are not unicast. The service redirects to the stored destination; it does not fetch the destination itself. If link previews or server-side scans are added, DNS rebinding and outbound network controls need additional protection.'

Add-Heading '7. Click delivery, cache behavior, and failure cases'
Add-Bullet 'The API adds click events to a Redis Stream. A consumer group lets the worker read batches and claim old pending entries after an idle interval.'
Add-Bullet 'The worker bulk-inserts events with a unique event key and updates daily totals in the same PostgreSQL transaction. It acknowledges and removes stream entries only after persistence succeeds.'
Add-Bullet 'Transient processing failures are rescheduled with capped exponential backoff. After the configured maximum attempts, events go to a dead-letter stream for inspection.'
Add-Bullet 'Redis cache failures fall back to PostgreSQL. Queue enqueue failure is fail-open for redirects, so the user still gets redirected but that click may be lost. Redis persistence is configured, but Redis alone is not a formal guarantee against every data-loss scenario.'
Add-Bullet 'Cache entries have a bounded TTL (one hour by default), shortened to the link expiry when applicable. Link deletion invalidates the cached code.'

Add-Heading '8. Security and ownership'
Add-Bullet 'JWTs use HS256 and are checked for issuer and audience. Access tokens expire after 15 minutes by default. The frontend stores the token in sessionStorage, which limits persistence but remains accessible to injected same-origin JavaScript.'
Add-Bullet 'Password hashes use Argon2id. Login failures are rate-limited by IP; link creation is limited by account and IP through Redis.'
Add-Bullet 'Every link read, analytics request, and delete uses the authenticated subject as the owner scope. The API does not accept an owner ID from the browser as authority.'
Add-Bullet 'Click analytics retain the referrer hostname and coarse device category. The user-agent string is parsed and discarded, rather than retained as a raw value.'

Add-Heading '9. How I would discuss scale'
Add-Para 'At 10 million links and 1,000 redirects per second, I would first measure cache hit rate, redirect p95/p99, database query latency, Redis latency, queue depth, oldest event age, dropped events, and worker throughput. The current architecture separates the read-heavy redirect path from analytics persistence, but scale claims need measurements on a stated machine and workload.'
Add-Bullet 'Keep the redirect cache hot and size Redis for the working set; use connection pooling and monitor eviction and latency.'
Add-Bullet 'Scale stateless API instances horizontally behind a load balancer. Use managed PostgreSQL or a properly operated primary/replica setup, connection pooling, and partitioning or retention for high-volume click events.'
Add-Bullet 'Scale workers independently and tune batch size/concurrency using queue age and database capacity. A durable managed queue or a carefully operated Redis deployment can improve delivery guarantees.'
Add-Bullet 'Use load tests to compare cache enabled versus bypassed, report p95 and requests/second with errors and resource limits, and avoid presenting unmeasured numbers as results.'
Add-Para 'Current limitation: the repository includes a k6 script and a results table template, but no benchmark has been run. It exposes JSON health/metrics endpoints; it does not currently include a Prometheus exporter or Grafana dashboard.'

Add-Heading '10. API routes worth knowing'
Add-Bullet 'POST /api/v1/auth/register and POST /api/v1/auth/login; GET /api/v1/auth/me requires a bearer token.'
Add-Bullet 'POST /api/v1/links creates; GET /api/v1/links lists with pagination; GET /api/v1/links/:id reads one owned link; DELETE /api/v1/links/:id deletes it.'
Add-Bullet 'GET /api/v1/links/:id/analytics/summary, /clicks, /referrers, and /devices provide analytics to the owner.'
Add-Bullet 'GET /:code is public and redirects. /health/live checks process liveness; /health/ready checks PostgreSQL, Redis, and worker heartbeat; /health/metrics returns operational counters.'
Add-Bullet 'Swagger UI is available at http://localhost:3000/api/docs when the local stack is running.'

Add-Heading '11. Likely recruiter questions and concise answers'
Add-Heading 'Why use random Base62 codes instead of a sequence?', 2
Add-Para 'Random codes avoid exposing link volume or creation order and make casual enumeration harder. The unique index is authoritative, and I retry collisions. A sequence would make collision handling simpler and codes potentially more compact, but it reveals ordering and needs a separate encoding strategy.'
Add-Heading 'How do you keep analytics writes from slowing redirects?', 2
Add-Para 'The API records the event in Redis and a separate worker batches database writes. The redirect does wait for the Redis enqueue operation, so it is non-blocking with respect to PostgreSQL analytics persistence, not literally zero-cost. If enqueue fails, the redirect proceeds and the click can be lost.'
Add-Heading 'What delivery guarantee do you provide?', 2
Add-Para 'The worker uses a Redis consumer group, pending-entry recovery, idempotent inserts, retries, and a dead-letter stream. This is at-least-once processing with idempotent persistence under normal Redis durability assumptions. It is not a promise of zero loss if Redis data is lost or the enqueue fails.'
Add-Heading 'How do you prevent one user from viewing another user''s analytics?', 2
Add-Para 'The JWT guard verifies the token and puts the subject on the request. Link and analytics queries include both the requested link ID and that subject''s owner ID. A missing or non-owned link returns not found.'
Add-Heading 'What did you measure?', 2
Add-Para 'I have not run the k6 benchmark yet, so I will not quote a p95 or throughput result. The script supports cache-on and cache-bypass runs; I would report the machine/container limits, error rate, p95, requests per second, and cache hit rate for both.'

Add-Heading '12. Be transparent about the assessment gaps'
Add-Bullet 'The recruiter requested Java 17+ with Spring Boot and Angular. This repository currently uses NestJS and React. The architecture concepts transfer, but the submitted implementation does not satisfy that language/framework constraint.'
Add-Bullet 'The local Docker Compose stack is configured, but there is no live public HTTPS deployment or seeded demo account provisioned.'
Add-Bullet 'CI and PostgreSQL Testcontainers integration coverage are present in the repository. Do not claim a passing CI run unless you have actually run or observed it.'
Add-Bullet 'The load-test script exists, but the results table is empty because no benchmark has been run.'
Add-Bullet 'The brief asks to record user-agent data. This implementation parses user-agent only to determine coarse device type and discards the raw string.'
Add-Para 'A credible answer is: Those are the remaining deliverables. I would port the API to Spring Boot and the UI to Angular if the stack requirement is strict, then run CI, deploy to a free-tier host with environment-based secrets, create a demo account, and capture reproducible k6 results.'

Add-Heading '13. Five-minute demo sequence'
Add-Bullet 'Show the register/login screen and explain JWT ownership.'
Add-Bullet 'Create a link to a public HTTPS destination, optionally add an alias or expiry, and point out server-side validation.'
Add-Bullet 'Open the short URL in a new tab and show the 302 redirect.'
Add-Bullet 'Return to the dashboard, refresh after the worker processes the event, and open analytics.'
Add-Bullet 'Explain the Redis cache hit path and the asynchronous click stream, then show /health/ready and /health/metrics.'
Add-Bullet 'Close with the measured-versus-unmeasured distinction and the required Spring Boot/Angular porting work.'
$null = Add-Content -LiteralPath $debugLog -Value 'content added'

$null = Add-Content -LiteralPath $debugLog -Value 'footer skipped'
$doc.SaveAs2($output, 16)
$null = Add-Content -LiteralPath $debugLog -Value 'docx saved'
$doc.ExportAsFixedFormat($pdf, 17)
$null = Add-Content -LiteralPath $debugLog -Value 'pdf exported'
$doc.Close(0)
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($sel) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Get-Item $output | Select-Object FullName,Length
Get-Item $pdf | Select-Object FullName,Length
