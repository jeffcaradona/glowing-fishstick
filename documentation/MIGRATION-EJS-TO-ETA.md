# Migration Plan: EJS → Eta (v0.1.0)

**Status:** Planned  
**Version Target:** 0.1.0 (Breaking Change)  
**Reason:** Eliminate EJS transitive dependency on `jake` which carries ReDoS vulnerability in `minimatch`

## Problem Statement

EJS v4.0.1 depends on `jake` (build tool), which pulls in `filelist` → `minimatch` (<10.2.1). The `minimatch` package has a ReDoS vulnerability (GHSA-3ppc-4f35-3m26) that cannot be resolved without upgrading EJS to v3.0.2 (breaking change) or replacing the template engine entirely.

**Current Vulnerability Chain:**
```
ejs@4.0.1 → jake → filelist → minimatch (<10.2.1) [VULNERABLE]
```

**Solution:** Replace EJS with Eta, a smaller, faster, well-maintained alternative with identical template syntax.

## Template Syntax Comparison

| Feature | EJS | Eta | Migration |
|---------|-----|-----|-----------|
| Output | `<%= var %>` | `<%= var %>` | ✅ No change |
| HTML escape | `<%- html %>` | `<%~ html %>` | **Update** |
| Logic (if/for) | `<% if () {} %>` | `<% if () {} %>` | ✅ No change |
| Include | `<%- include('file') %>` | `<%= include('file') %>` | **Update** |
| Comments | `<%# comment %>` | `<%# comment %>` | ✅ No change |
| Include with data | `include(path, obj)` | `include(path, obj)` | ✅ No change |

## Implementation Phases

### Phase 1: Dependency & Engine Configuration

**Files to Update:**

1. **core/app/package.json**
   - Remove: `"ejs": "^4.0.1"`
   - Add: `"eta": "^3.4.0"`
   - Update `@glowing-fishstick/shared` dependency version to `0.1.0`

2. **core/app/src/app-factory.js**
   - Line 59: Change `app.set('view engine', 'ejs')` → `app.set('view engine', 'eta')`
   - Line 61: Update comment from "prevent EJS memory leak" → "Eta compiles templates once"
   - Update JSDoc comment (line 31) from "EJS" to "Eta"

### Phase 2: Template File Conversions

**Core Templates (6 files in `core/app/src/views/`):**

1. **index.ejs**
   - Line 1: `<%- include('layouts/header', { appName }) %>` → `<%= include('layouts/header', { appName }) %>`
   - Line 20: `<%- include('layouts/footer') %>` → `<%= include('layouts/footer') %>`

2. **admin/dashboard.ejs**
   - Line 1: `<%- include('../layouts/header', { appName, scripts }) %>` → `<%= include('../layouts/header', { appName, scripts }) %>`
   - Line 75: `<%- include('../layouts/footer') %>` → `<%= include('../layouts/footer') %>`

3. **admin/config.ejs**
   - All `<%- include(...) %>` → `<%= include(...) %>`

4. **errors/404.ejs**
   - All `<%- include(...) %>` → `<%= include(...) %>`

5. **layouts/header.ejs**
   - All `<%- include(...) %>` → `<%= include(...) %>`

6. **layouts/footer.ejs**
   - No changes needed (typically no includes)

**Consumer Templates (2 files in `app/src/views/`):**

1. **index.ejs**
   - Update all `<%- include(...) %>` → `<%= include(...) %>`

2. **tasks/list.ejs**
   - Update all `<%- include(...) %>` → `<%= include(...) %>`

**Template Project (3 files in `template/app/src/views/`):**

1. **my-feature.ejs**
   - Update all `<%- include(...) %>` → `<%= include(...) %>`

2. **layouts/header.ejs**
   - Update all `<%- include(...) %>` → `<%= include(...) %>`

3. **layouts/footer.ejs**
   - Update all `<%- include(...) %>` → `<%= include(...) %>`

### Phase 3: Development Configuration

**Update nodemon watch extensions (remove `.ejs` monitoring if desired):**

1. **app/package.json** - dev script
   - Change `--ext js,mjs,cjs,json,ejs` → `--ext js,mjs,cjs,json,eta` (optional)

2. **api/package.json** - dev script
   - Change `--ext js,mjs,cjs,json,ejs` → `--ext js,mjs,cjs,json,eta` (optional)

3. **template/app/package.json** - dev script
   - Change `--ext js,mjs,cjs,json,ejs` → `--ext js,mjs,cjs,json,eta` (optional)

4. **template/api/package.json** - dev script
   - Change `--ext js,mjs,cjs,json,ejs` → `--ext js,mjs,cjs,json,eta` (optional)

### Phase 4: Version Bumps

**All package.json files:**

Update version from `0.0.2` to `0.1.0`:

- `package.json` (root)
- `core/app/package.json`
- `core/shared/package.json`
- `core/api/package.json`
- `app/package.json`
- `api/package.json`
- `template/app/package.json` (if versioned)
- `template/api/package.json` (if versioned)

### Phase 5: Documentation Updates

1. **README.md**
   - Line 123: Update "EJS view engine with layouts" → "Eta view engine with layouts"
   - Line 511: Update section title from "Customizing EJS templates" → "Customizing Eta templates"
   - Line 528: Update "module uses EJS" → "module uses Eta"
   - Line 530+: Update code block syntax from EJS to Eta (include statements)

2. **core/app/README.md**
   - Update tech stack reference from "EJS" to "Eta"

3. **documentation/00-project-specs.md**
   - Section 9 (Views): Comprehensive rewrite
     - Line 559: `## 9. Views (Eta)` (change from EJS)
     - Line 561: Update view engine description to Eta
     - Line 567: Update layout system explanation
     - Line 570: Update code block examples with Eta syntax
     - Line 579-584: Update view list (no structural changes, just variable names)

4. **CLAUDE.md**
   - Line 605: Update tech stack from "EJS (templating)" to "Eta (templating)"

5. **app/DEV_APP_README.md**
   - Line 48: Update comment from "EJS templates" to "Eta templates"
   - Line 511: Update example section header
   - Line 513+: Update code example with Eta syntax

## Validation Steps

### Pre-Migration Testing
```bash
npm test:all                    # Baseline test coverage
npm audit                       # Verify vulnerabilities exist
```

### Post-Migration Testing
```bash
npm install                     # Install Eta
npm test:all                    # Should pass all tests
npm audit                       # Should show 0 high vulnerabilities
npm run start:app               # Verify app loads
npm run start:api               # Verify API loads
npm run dev:app                 # Verify dev auto-reload works
```

### Manual Smoke Tests
- [ ] Visit `/` - landing page renders correctly
- [ ] Visit `/admin` - dashboard renders with memory stats
- [ ] Visit `/admin/config` - config table displays
- [ ] Visit `/healthz` - JSON response works
- [ ] 404 error page renders correctly
- [ ] Verify no console errors in browser

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Template syntax errors | Low | Systematic conversion with test coverage |
| Include path issues | Low | Same include mechanism, only syntax changes |
| Performance differences | Low | Eta is generally faster than EJS |
| Breaking change | High | Clear version bump to 0.1.0, documented |

## Rollback Plan

If issues arise:
1. Revert all package.json changes
2. Revert all template files
3. Restore prior version tag
4. No database or state changes involved (safe rollback)

## Success Criteria

✅ All tests pass (`npm test:all`)  
✅ `npm audit` shows 0 high vulnerabilities  
✅ All views render correctly  
✅ No console errors in app or API  
✅ Dev watch mode works with nodemon  
✅ Documentation is consistent and up-to-date  
✅ Version bumped to 0.1.0 in all packages
