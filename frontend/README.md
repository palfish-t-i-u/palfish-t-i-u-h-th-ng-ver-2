# PalFish GMV Reconciliation — Frontend

## Testing

Framework: **Vitest** + **React Testing Library** + **MSW** (Mock Service Worker).

### Chạy toàn bộ test

```bash
cd frontend
npx vitest run
```

### Chạy test cho module báo cáo BC01 / BC02 / BC03

```bash
# Chạy cả 3 báo cáo
npx vitest run src/components/reports/BC01SalesPerformance.test.tsx \
               src/components/reports/BC02KeyDataReport.test.tsx \
               src/components/ReportBC03Tab.test.tsx

# Chạy riêng từng báo cáo
npx vitest run src/components/reports/BC01SalesPerformance.test.tsx   # BC01 — Sales Performance (11 tests)
npx vitest run src/components/reports/BC02KeyDataReport.test.tsx      # BC02 — Key Data (13 tests)
npx vitest run src/components/ReportBC03Tab.test.tsx                  # BC03 — Báo cáo tổng bộ (21 tests)
```

### Test files

| Báo cáo | Test file | Tests | Phạm vi |
|---------|-----------|-------|---------|
| BC01 — Sales Performance | `src/components/reports/BC01SalesPerformance.test.tsx` | 11 | Data rendering, grand total, month columns, team subtotals, empty/error states, team filter, date inputs, refresh |
| BC02 — Key Data | `src/components/reports/BC02KeyDataReport.test.tsx` | 13 | Date formatting, grand total, scope label, column groups, empty/error states, zero-count dash, team filter, refresh |
| BC03 — Báo cáo tổng bộ | `src/components/ReportBC03Tab.test.tsx` | 21 | Live KPI cards, revenue/trial/referral tabs, filter mode, currency toggle, save KPI, error/empty states, exchange rate, team filter, month picker, staff picker |

### Cấu trúc test

- **MSW handlers** (mock API): `src/test/msw/handlers.ts`
- **MSW server**: `src/test/msw/server.ts`
- **Test setup**: `src/test/setup.ts`
- **Vitest config**: tích hợp trong `vite.config.ts`

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
