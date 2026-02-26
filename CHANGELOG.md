# Changelog

## [0.4.0](https://github.com/tokentopapp/tokentop/compare/v0.3.0...v0.4.0) (2026-02-26)


### Features

* **plugins:** parallelize loading and fix source priority ([d46b6fb](https://github.com/tokentopapp/tokentop/commit/d46b6fbb171d24471c88eec0f019aaf6b7c04e5e))
* **settings:** add plugin settings with hierarchical sidebar and description help area ([1ed719d](https://github.com/tokentopapp/tokentop/commit/1ed719dfee00b4a712df9f2d819a7a26eef75b06))


### Bug Fixes

* **dashboard:** stabilize list selection and clear scrollbox ghost text ([643de17](https://github.com/tokentopapp/tokentop/commit/643de1756e39dcd719aebea10a851d3b1c7d15c1))
* **lint:** resolve biome format errors blocking CI ([070b6bc](https://github.com/tokentopapp/tokentop/commit/070b6bc539fd7869c36777451df0f2c661d21d1c))
* **providers:** support zhipuai-coding-plan auth key ([#33](https://github.com/tokentopapp/tokentop/issues/33)) ([f86ed40](https://github.com/tokentopapp/tokentop/commit/f86ed405cfbca66266b2240ae36e5c40f29fa38e))
* **storage:** add data retention to prevent unbounded database growth ([ae37da8](https://github.com/tokentopapp/tokentop/commit/ae37da8833862a45eb0acba6d9a3f389f2914dbd))
* **storage:** decouple session persistence from React lifecycle ([0818789](https://github.com/tokentopapp/tokentop/commit/0818789bff92faa7ea1f846a525129652c7a0db8))

## [0.3.0](https://github.com/tokentopapp/tokentop/compare/v0.2.2...v0.3.0) (2026-02-21)


### Features

* **providers:** enrich provider view with session-derived token and cost data ([1e99f4f](https://github.com/tokentopapp/tokentop/commit/1e99f4f342d50a8a5be28f095f55140105353c8f))
* **tui:** add provider column to session details drawer ([9991b39](https://github.com/tokentopapp/tokentop/commit/9991b397144f092e69f482a909b1cd28e0c26fd5))


### Bug Fixes

* **dashboard:** eliminate scroll jank with ref-based offset and useLayoutEffect ([a6baf11](https://github.com/tokentopapp/tokentop/commit/a6baf1187023010fbf0673826c6378e4c5ce910c))
* **deps:** update dependency zod to v4 ([#20](https://github.com/tokentopapp/tokentop/issues/20)) ([373ef30](https://github.com/tokentopapp/tokentop/commit/373ef302c467a025bf5f706cd12a4cc083353472))
* **deps:** update opentui to v0.1.80 ([#9](https://github.com/tokentopapp/tokentop/issues/9)) ([4a78dca](https://github.com/tokentopapp/tokentop/commit/4a78dca8e0f820788a26e410dde4be5b11d8c679))
* prevent memory leak and process hang on shutdown ([1768a3f](https://github.com/tokentopapp/tokentop/commit/1768a3fa581633083ee679c7671ab7fd18b8a247))
* **projects:** add scroll tracking with viewport follow and fix Shift+G navigation ([9c3a39b](https://github.com/tokentopapp/tokentop/commit/9c3a39b219c536f8a9490a1edb5117bb3da815aa))
* **release:** allow feat commits to bump minor version pre-1.0 ([80134df](https://github.com/tokentopapp/tokentop/commit/80134df10b9edfbfd90ddbe9ca176c0b23d4ce6c))

## [0.2.2](https://github.com/tokentopapp/tokentop/compare/v0.2.1...v0.2.2) (2026-02-17)


### Bug Fixes

* scope npm package name to @tokentop/tokentop ([c0c3a4b](https://github.com/tokentopapp/tokentop/commit/c0c3a4b607e81b9c1788553b86088adce1ea6b72))

## [0.2.1](https://github.com/tokentopapp/tokentop/compare/v0.2.0...v0.2.1) (2026-02-17)


### Bug Fixes

* drop darwin-x64 build target and use ARM64 runner for linux-arm64 ([3d5078b](https://github.com/tokentopapp/tokentop/commit/3d5078b792a3001f4ce9227f61d8e606571878ee))
* use ARM64 runner for linux-arm64 binary build ([e89e756](https://github.com/tokentopapp/tokentop/commit/e89e75645c20691ceae4ba43bdfee2f88fbcc194))

## [0.2.0](https://github.com/tokentopapp/tokentop/compare/v0.1.0...v0.2.0) (2026-02-17)


### ⚠ BREAKING CHANGES

* **providers:** anthropic-api removed (use anthropic)

### Features

* **activity:** add injectDelta for direct real-time token injection ([7e45428](https://github.com/tokentopapp/tokentop/commit/7e454285359b2a7b5c389d299e03e756734c9a6e))
* add budget period lock/sync toggle to sidebar ([e167151](https://github.com/tokentopapp/tokentop/commit/e167151e838fe786e0727e2eeaaff72eda832797))
* add cache data display and fix sessions scroll tracking ([5399acc](https://github.com/tokentopapp/tokentop/commit/5399accc3499c3d4f228f24225a3918a1f33ce68))
* add distribution pipeline with cross-platform binaries, release-please, and Renovate ([6738328](https://github.com/tokentopapp/tokentop/commit/67383282752bb3e1556d0d08239dc88a27ebf16b))
* add fade-out animation to SessionsTable rows on session removal ([0847a58](https://github.com/tokentopapp/tokentop/commit/0847a584b4158468197cecfe1768a7abb48f9d98))
* add initial unit test suite, remove redundant worktree scripts ([17fa5cf](https://github.com/tokentopapp/tokentop/commit/17fa5cf388dab70f24d937acd9cd9c98bb494691))
* add plugin error isolation (safeInvoke + circuit breaker) and SQLite-backed KV storage ([b460eac](https://github.com/tokentopapp/tokentop/commit/b460eac90f2af55f97a2e1a9fd09901f403d7c81))
* add plugin lifecycle manager with initialize/start/stop/destroy hooks ([bd0ad49](https://github.com/tokentopapp/tokentop/commit/bd0ad49d11e57329e47207e7938560328d66041b))
* add plugins tab with update checker and log controls to debug panel ([71d7330](https://github.com/tokentopapp/tokentop/commit/71d7330e7367c5e2e74d068077977fb8442c927b))
* add sandbox guard with AsyncLocalStorage fetch interception and deep-freeze ([717dec0](https://github.com/tokentopapp/tokentop/commit/717dec0b8a3ccea836b9859db1ba6d0b262573aa))
* add Shift+Tab to cycle dashboard panels backwards ([b7e3ff0](https://github.com/tokentopapp/tokentop/commit/b7e3ff0bff30f62a255a7f7e34f4705c233254cb))
* add SQLite session reader for OpenCode 1.2 with JSON fallback ([#2](https://github.com/tokentopapp/tokentop/issues/2)) ([07c09d2](https://github.com/tokentopapp/tokentop/commit/07c09d2dc7584b3f6fb7818ca548779e4c9a451d)), closes [#1](https://github.com/tokentopapp/tokentop/issues/1)
* adopt OpenTUI 0.1.79 features across codebase ([7abf8be](https://github.com/tokentopapp/tokentop/commit/7abf8be197ec99ec04a61261eb1ba7f84fe98bd0))
* **agent:** add ActivityUpdate types and optional watch methods to plugin interface ([6c1a03d](https://github.com/tokentopapp/tokentop/commit/6c1a03d871c4f2d45381e9ef3138a02772075d06))
* allow community plugin naming conventions in npm loader ([2c7ea2e](https://github.com/tokentopapp/tokentop/commit/2c7ea2e14325c44ddc232b522137ebdafea5b021))
* **budgets:** add budget/alert system with KPI coloring ([36711ff](https://github.com/tokentopapp/tokentop/commit/36711ffa0a0524ea8b7c9f977c854cf4ad82a485))
* **budget:** tie budget tracking to time window periods ([4a1b4a6](https://github.com/tokentopapp/tokentop/commit/4a1b4a6102cfb8f75bfbb08ba9088de1fa55db59))
* compute windowed budget costs from message timestamps during aggregation ([e0b0256](https://github.com/tokentopapp/tokentop/commit/e0b025696e79d401ffddcef4f8936ed8a68e501f))
* **config:** add ConfigContext, command palette, and extract components ([ea24b7e](https://github.com/tokentopapp/tokentop/commit/ea24b7eabfe1e1a838c4609fd664734ef06f982e))
* **credentials:** add OpenCode auth discovery types ([1dc1590](https://github.com/tokentopapp/tokentop/commit/1dc15900ba9ee7b1f2876f303a4e4d4facf1dafb))
* **dashboard:** add ghost placeholders to provider limits section ([579362f](https://github.com/tokentopapp/tokentop/commit/579362f410082ec39d7c32e22b69d7b9cff4d6f0))
* **dashboard:** add session details drawer and time window filtering ([c7b1e17](https://github.com/tokentopapp/tokentop/commit/c7b1e17059378204f1880c97f739b9f038d49e25))
* **dashboard:** enhance UX with KPI cards, help overlay, and activity metrics ([c57bab2](https://github.com/tokentopapp/tokentop/commit/c57bab2e207eb5b66ee4147da09ecb6fb157e21f))
* **debug:** add TUI frame capture system and headless snapshot tool ([79137bc](https://github.com/tokentopapp/tokentop/commit/79137bcc54a7c0c49802169660aeb26dda1d6207))
* **demo:** add deterministic demo mode for testing ([a40b456](https://github.com/tokentopapp/tokentop/commit/a40b45683b97eef633eb5ea29d5095e8cd0e61b3))
* **demo:** add more test providers for heavy preset ([a5fb991](https://github.com/tokentopapp/tokentop/commit/a5fb991ed9c8c48bf2d6134f423481c1d8554f22))
* **driver:** add sleep command for time-based testing ([5d530a8](https://github.com/tokentopapp/tokentop/commit/5d530a866a3792f619dbdf3bdf7b54006d710e7e))
* **driver:** add test mode infrastructure for headless TUI automation ([9eeda0a](https://github.com/tokentopapp/tokentop/commit/9eeda0a6b480836a48d311363d40b6997d3b1963))
* **driver:** implement headless TUI driver with CLI interface ([2c59709](https://github.com/tokentopapp/tokentop/commit/2c59709e3914705f4dc5cba6a064cc7bca6823d7))
* **driver:** save metadata JSON alongside snapshot frames ([735bece](https://github.com/tokentopapp/tokentop/commit/735bece478da9fb4f15c2058d8d166ca3d9ce6de))
* migrate provider auth from centralized to plugin-owned discovery ([5d791f2](https://github.com/tokentopapp/tokentop/commit/5d791f2d2aed81a4049ce61cbdb6b4510c449385))
* npm plugin auto-install via bun add --cwd ~/.cache/tokentop ([56fd2eb](https://github.com/tokentopapp/tokentop/commit/56fd2eb04524cd1d51c54ca0e39b44636ce18145))
* **opencode:** implement real-time activity watcher for parts directory ([1cd2604](https://github.com/tokentopapp/tokentop/commit/1cd26046479cfe0b40960b8fa19dd8c86475028a))
* plugin loading infrastructure — CLI flag, config, and directory support ([116e70c](https://github.com/tokentopapp/tokentop/commit/116e70ca5873e0582082c052fb1e8598d3a32b42))
* **providers:** add minimax and minimax-coding-plan providers ([98b2627](https://github.com/tokentopapp/tokentop/commit/98b26276fcabe79bfc5ed77c2895cf1db8c409bc))
* **providers:** add opencode-zen provider ([b863b78](https://github.com/tokentopapp/tokentop/commit/b863b78fe8ffedab850c67be3d33281a33501d9a))
* **providers:** add zai-coding-plan provider ([0cc259a](https://github.com/tokentopapp/tokentop/commit/0cc259a5ee501e5b439ab6d824d92e9fe37c9b11))
* rebuild theme system with persistent config, theme picker, 15 color-accurate themes, and startup flash fix ([dbffb68](https://github.com/tokentopapp/tokentop/commit/dbffb6824acd07a6efe5340c42fe71eb3a9c35b9))
* redesign efficiency section with prioritized actionable insights ([c13d194](https://github.com/tokentopapp/tokentop/commit/c13d194b10f70d99f4ede46733eec3b049cb570a))
* register claude-code agent plugin as builtin ([4de485e](https://github.com/tokentopapp/tokentop/commit/4de485ec947e2aa735547f9c2c34b7734083c8ad))
* render plugin ConfigField entries in Settings UI ([9563895](https://github.com/tokentopapp/tokentop/commit/95638957601bb8ef0fa2d11c387e6d530cf0f80a))
* **scripts:** implement worktree create, list, and remove commands ([b825abe](https://github.com/tokentopapp/tokentop/commit/b825abe1cb8b64ca6c0d084a4626d9c7693a8f40))
* **scripts:** implement worktree status, switch, and cleanup commands ([b528dcf](https://github.com/tokentopapp/tokentop/commit/b528dcfcdc8bf9a2947747eba53885cd568ad96b))
* session loading performance — stat-based mtime index, fs.watch dirty set, selective persistence ([b613ac3](https://github.com/tokentopapp/tokentop/commit/b613ac39fd0dfa9a6355f39d1f288c548108071a))
* **settings:** add dynamic theme selector to display settings ([a345edb](https://github.com/tokentopapp/tokentop/commit/a345edb9082b4933b0cc35166498f727ae75194d))
* **sparkline:** add visible baseline and improve scaling ([0854e07](https://github.com/tokentopapp/tokentop/commit/0854e0768a346f4e341ba0bd1ca43fb3daa0b651))
* **state:** add DashboardRuntimeContext for state persistence ([e4ce71a](https://github.com/tokentopapp/tokentop/commit/e4ce71a5345c5e114599f9e4ba447e28417fed8d))
* **storage:** add SQLite persistence layer with WAL mode ([15b5253](https://github.com/tokentopapp/tokentop/commit/15b52535733a5a5e2707d8e95b35a1da171dc049))
* **tui:** add DebugPanel, SettingsModal, and modal support components ([1d40382](https://github.com/tokentopapp/tokentop/commit/1d4038280f7e4301bc1d4e8b9dc6936351274b45))
* **tui:** add entrance animation for new session rows and reorder columns ([bcf4c8d](https://github.com/tokentopapp/tokentop/commit/bcf4c8dcb4257d7e77be6fce9f02fc3d200e98c0))
* **tui:** add keyboard navigation for provider limits panel ([adfc7b0](https://github.com/tokentopapp/tokentop/commit/adfc7b0d1f99b18a42cf95905da9b72a796e722e))
* **tui:** add RealTimeActivityContext for streaming token events ([2b2428c](https://github.com/tokentopapp/tokentop/commit/2b2428cd7ec6a3399c26917805b5865a464d9a67))
* **tui:** add sliding window for provider limits navigation ([cda5639](https://github.com/tokentopapp/tokentop/commit/cda5639dac4ab0bc9a149de7330e367e0c71c8e5))
* **tui:** add sparkline configuration with braille rendering and baseline options ([a497a3b](https://github.com/tokentopapp/tokentop/commit/a497a3ba7cd9c8c71ef71eb211f59432f82e1fe5))
* **tui:** add TIME WINDOW as first stat tile in KPI strip ([1d9f3b5](https://github.com/tokentopapp/tokentop/commit/1d9f3b53320c00333ef8327d00cb1ca49ced5b7b))
* **tui:** add value animation hooks for flash effects and smooth transitions ([120e971](https://github.com/tokentopapp/tokentop/commit/120e97179fb4c7a0ac8a432b2471e074e3d4b859))
* **tui:** enhance dashboard with responsive header, vim navigation, and provider error states ([996284f](https://github.com/tokentopapp/tokentop/commit/996284ff58d8a29560c1d5e77586270611b4e3e2))
* **tui:** integrate animations into KPI strip and improve skeleton shimmer ([adcea53](https://github.com/tokentopapp/tokentop/commit/adcea53eea83cd0a95800623b702372729e6700e))
* **tui:** redesign provider limits with responsive layout and visual upgrades ([ee2c99e](https://github.com/tokentopapp/tokentop/commit/ee2c99ea8e9b28aa500a128d6b0c894f67bf6042))
* **tui:** redesign providers, trends, and projects screens ([6d8a804](https://github.com/tokentopapp/tokentop/commit/6d8a804e37a052e6e3b201b28e173980cefc6030))
* **tui:** show session names in sessions table ([00a2287](https://github.com/tokentopapp/tokentop/commit/00a2287dbbe948d86933f7cbdd96a8c4be770e6a))
* **tui:** wire up real-time activity tracking to dashboard ([108da73](https://github.com/tokentopapp/tokentop/commit/108da73c48a58befd2d6d31cec92001c02961ca5))
* **views:** add Historical Trends, Projects views and usePulse hook ([9800575](https://github.com/tokentopapp/tokentop/commit/98005750921806d6238f3e93cf9a9097667694ae))
* wire notification event bus for budget and rate-limit alerts ([71a5580](https://github.com/tokentopapp/tokentop/commit/71a558079aa20462136d051b9c71ba0c7de0a0bf))


### Bug Fixes

* activity sparkline not updating during subagent calls ([09ae64f](https://github.com/tokentopapp/tokentop/commit/09ae64f1863d2b3b632a1a2d782dfb0ffa01f7f3))
* **activity:** cap rate window at 10s to show bursts not diluted averages ([3eefce9](https://github.com/tokentopapp/tokentop/commit/3eefce95ea42f7ee6317284673199118bc42ec17))
* **activity:** improve rate tracking with decay and responsive timing ([f665900](https://github.com/tokentopapp/tokentop/commit/f6659009dbd56d4eacd5ed096249cf7ef06506c9))
* **activity:** increase delta token threshold from 100K to 1M ([5a7c8dd](https://github.com/tokentopapp/tokentop/commit/5a7c8dda9988acd6629faf0f5968ba62b397b55b))
* base64 encode publicly-known OAuth client IDs/secrets to bypass GitHub push protection ([6ab876c](https://github.com/tokentopapp/tokentop/commit/6ab876cb86078f2939c63329e6c4e961259824a4))
* **budget:** show full cents in budget display ([a84b204](https://github.com/tokentopapp/tokentop/commit/a84b2044b51fefc0c365cef1629b1afa5488c9ad))
* daily budget showing lifetime session cost instead of windowed cost ([1441e47](https://github.com/tokentopapp/tokentop/commit/1441e47358e32b2728dbefb1160a0ea439d7bbd4))
* **dashboard:** correct delta and burn rate calculations ([776f86a](https://github.com/tokentopapp/tokentop/commit/776f86abd442d0e10fb75b9e47eb4a8447782b43))
* **dashboard:** prevent layout shift on provider load ([d554bf0](https://github.com/tokentopapp/tokentop/commit/d554bf0e49efc040dfde0f535ee602970d9f93a2))
* **dashboard:** prevent text overlap in sessions and sidebar ([26cb12c](https://github.com/tokentopapp/tokentop/commit/26cb12c201c08b98aa8dc5fc0ced26c19a805501))
* **dashboard:** session list scrolling and modal improvements ([6c43487](https://github.com/tokentopapp/tokentop/commit/6c434874b59f833af2875ba3279488b85c6d69a1))
* downgrade noisy session refresh logs from info to debug ([66423e4](https://github.com/tokentopapp/tokentop/commit/66423e40608d232fc812702e8e9bc86a3bda5c52))
* **header:** simplify keyboard shortcuts display ([93a2de9](https://github.com/tokentopapp/tokentop/commit/93a2de9cec3dc0e228f4ed18f1e620b33318c790))
* improve narrow sessions table layout with TOKENS and COST columns ([760687d](https://github.com/tokentopapp/tokentop/commit/760687d4f20f4c4822497f30b89a4923c3296413))
* include cache tokens in global dashboard total (closes [#7](https://github.com/tokentopapp/tokentop/issues/7)) ([b144a0c](https://github.com/tokentopapp/tokentop/commit/b144a0cfdff4a4dc8589e12e351a015534d80062))
* **keyboard:** pass Ctrl+ shortcuts through dashboard handler ([0511718](https://github.com/tokentopapp/tokentop/commit/0511718c22d273acc16c32f66afe1e2035a59f19))
* **layout:** prevent CompactGauge text wrapping in provider cards ([cb9505f](https://github.com/tokentopapp/tokentop/commit/cb9505f7f21654514d19513502c70269881bc142))
* **layout:** proper 3-line CompactGauge layout ([18a84e8](https://github.com/tokentopapp/tokentop/commit/18a84e8c91c618fbf5bbaec2b254e391a2185770))
* merge release-please into release workflow to fix GITHUB_TOKEN event trigger limitation ([f88482d](https://github.com/tokentopapp/tokentop/commit/f88482dd90dba67a7f4f519f5bc0d309ad3ed0fa))
* prevent pre-1.0 major version bumps in release-please ([eeba8be](https://github.com/tokentopapp/tokentop/commit/eeba8be266f56a1c0d2e0626909f239b20b88e75))
* **projects:** resolve all 14 QA findings for production polish ([9b32d22](https://github.com/tokentopapp/tokentop/commit/9b32d227c032de036c907ca595b96d036ab83303))
* **ProviderCard:** never hide urgent limits in carousel ([57c2e57](https://github.com/tokentopapp/tokentop/commit/57c2e57df7f29b41b7c207a7282c157d23db12c1))
* **providers:** fix selection highlight, detail panel, responsive layout, and card sizing ([db33497](https://github.com/tokentopapp/tokentop/commit/db33497c716faa9cb6cd1103aaa2e81726714520))
* remove 50-session cap and add aggregate caching for full session visibility ([f983357](https://github.com/tokentopapp/tokentop/commit/f9833578ded8058e102eb3e4193526a8bcbc8bd7))
* remove dead compactMode setting from config and settings UI ([c39ca4b](https://github.com/tokentopapp/tokentop/commit/c39ca4b92ccdbf8c27796785313e02046483a786))
* remove stale JSONC tests and fix config schema tests ([4cefb06](https://github.com/tokentopapp/tokentop/commit/4cefb06fa3e543e5a21a63a38cc7360c4ab19cff))
* replace $/HR column with total COST in sessions table ([dba7301](https://github.com/tokentopapp/tokentop/commit/dba7301c9847a112983da9dbc61ae4cc3e8bc429))
* replace require() with static import for bun --compile compatibility ([bfe9dea](https://github.com/tokentopapp/tokentop/commit/bfe9dea29f87b75dfa01170394e1ded9b553029d))
* reset version to 0.1.0 and fix release-please tag format ([f22e34e](https://github.com/tokentopapp/tokentop/commit/f22e34e08c2318eff1616dfdfaf43de4de304c1a))
* restore provider color resolution with providerAliases ([c8739f6](https://github.com/tokentopapp/tokentop/commit/c8739f6aef3238a181bc8fc07097527f2a9c148d))
* **sessions:** improve real-time active session detection ([e283507](https://github.com/tokentopapp/tokentop/commit/e283507c41a5fbe3b08ac3efc04841782b986dc8))
* **settings:** add scrollable viewport for small terminals ([6e724fc](https://github.com/tokentopapp/tokentop/commit/6e724fc96e6fbbc2d61da11086e6170cec192e03))
* **settings:** improve budget input and navigation ([7d90e7f](https://github.com/tokentopapp/tokentop/commit/7d90e7f8c9a01e5b7ea7651c4f106cac59fed75a))
* **sparkline:** improve visual fidelity with sqrt scaling and fixed thresholds ([94cc8bc](https://github.com/tokentopapp/tokentop/commit/94cc8bc93b8e92d4e15fe3829ef571ef880e0c46))
* **toast:** memoize context functions to prevent stale closures ([264ef0f](https://github.com/tokentopapp/tokentop/commit/264ef0f3d65536ce34034d51ee08b65e16c52ae9))
* **trends:** resolve all 11 review findings for Trends view (P0-P3) ([12bbc51](https://github.com/tokentopapp/tokentop/commit/12bbc516ce88d40d35375ecc94e6bdb8dbae8dba))
* **tui:** improve filter UX and stabilize footer layout ([ff1287c](https://github.com/tokentopapp/tokentop/commit/ff1287c7689cfd6f0a66e942832d494dcd9bda50))
* **tui:** move limits title to border row to save vertical space ([99ca659](https://github.com/tokentopapp/tokentop/commit/99ca6592e521232ecab1b46c6515ff9d856583e9))
* **tui:** remove detail line from limits panel to prevent layout shift ([fc2610b](https://github.com/tokentopapp/tokentop/commit/fc2610bf69e45301ee08ade39afcdfaa1a8dc9f7))
* **tui:** resolve provider limits display corruption with explicit heights ([c341a5b](https://github.com/tokentopapp/tokentop/commit/c341a5b3e40721d0b0a660aa52659e6dcb941cf2))
* **tui:** show dates instead of times for multi-day session timelines ([20350e4](https://github.com/tokentopapp/tokentop/commit/20350e426d7eb7f21f6a8b53c86dc84c7fdcc489))
* **tui:** use cyan bar for limit gauge selection indicator ([271e710](https://github.com/tokentopapp/tokentop/commit/271e71084e6d68a484d89b070be31e5b29c85b8f))
* **tui:** use refs for keyboard state to prevent stale closures ([653861c](https://github.com/tokentopapp/tokentop/commit/653861c4b1131341270819cc4f573af6dd6082f0))
* **tui:** use visible cyan bar indicators for provider scroll ([d85de21](https://github.com/tokentopapp/tokentop/commit/d85de21fcc9b3e305f9ca7c3ce282b190b3ada76))
* use costColor instead of undefined warningColor in narrow session row ([cbcba07](https://github.com/tokentopapp/tokentop/commit/cbcba0776f1e911e22d644540945e764ee73e92c))
* **ux:** remove provider card carousel, fix keyboard conflicts, add drawer actions ([8250b7c](https://github.com/tokentopapp/tokentop/commit/8250b7cd0f70d44aadad63f9f330843de5589899))
* **visual:** apply Gap Analysis [#2](https://github.com/tokentopapp/tokentop/issues/2)/[#3](https://github.com/tokentopapp/tokentop/issues/3) fixes and add Settings view ([73ddc65](https://github.com/tokentopapp/tokentop/commit/73ddc65d88b2e08efb3eff26677df4cd673dc003))
* **visual:** improve text readability on provider cards ([d0776f6](https://github.com/tokentopapp/tokentop/commit/d0776f6823f2e8ca30f919596852ab3a890e1125))
* **visual:** improve UsageGauge and ProviderCard consistency ([cef9c7c](https://github.com/tokentopapp/tokentop/commit/cef9c7ca20023f5636561bdf6e353db42f04f6fc))


### Performance

* **activity:** reduce session polling interval to 1 second ([3a9cf10](https://github.com/tokentopapp/tokentop/commit/3a9cf103fcbfb6ddca7309f0cfe2b09de6b85d85))


### Code Refactoring

* **providers:** consolidate anthropic providers with smart auth ([d287053](https://github.com/tokentopapp/tokentop/commit/d2870532381f09b36e71b2d7cbd15480036b7500))
