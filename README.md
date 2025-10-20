# SkolApp – Drop‑In Agent Pack (v0.4.1)

Detta paket är **redo att dras in i GitHub** (Upload files → Commit). Det lägger till:
- 15 bygg/test‑agenter (GitHub Actions + mallar)
- UI‑testagent som tar screenshots och bygger **PowerPoint‑rapport**
- Mallar för ADR, feature‑spec, PR‑checklista, Telemetry & GDPR
- Script för att bygga SUPERZIP på release‑tagg

## Snabbstart
1) Ladda upp allt i repo‑roten (`Upload files` i GitHub).
2) Öppna en PR → `CI` och `Security` körs automatiskt.
3) Actions → **UI Test Report** → `Run workflow` → ange din publika URL (Vercel/GitHub Pages).
   - Artifacts: `UI_Test_Report.pptx` + Playwright HTML‑rapport.
4) Skapa release: `git tag v0.4.2 && git push --tags` → SUPERZIP skapas i GitHub Releases.

### Pilot-konfiguration (backend)
- `CORS_ORIGINS` – kommaseparerad lista med tillåtna ursprung (standard: `http://localhost:19006,http://localhost:3000`).
- `PILOT_RETURN_TOKEN` – sätt till `true` för att API:t tillfälligt ska returnera magiska token i svaret.

## Mappar
- `.github/workflows/` – agenter (CI, Security, Triage, Release, UI Test)  
- `agents/` – 15 agentmallar (för policy & rutiner)  
- `tests/` – UI‑test som bygger PPTX‑rapport  
- `scripts/` – `package_superzip.mjs`  
- `docs/` – mallar (ADR, Feature Spec, Telemetry, GDPR, PR)

> Ändra gärna `README.md` efter dina behov. Inga hemligheter ska checkas in – använd **GitHub Secrets**.
