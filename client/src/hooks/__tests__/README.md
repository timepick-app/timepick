# useCalendar Hook Unit Tests

## Overview
This directory contains unit tests for the `useCalendar` custom React hook, which provides calendar navigation and state management functionality for the TimePick calendar UI.

## Test File
- **Location**: `client/src/hooks/__tests__/useCalendar.test.ts`
- **Test Framework**: Vitest
- **Testing Library**: @testing-library/react
- **Total Tests**: 17 test cases

## Prerequisites

All dependencies are already installed in the project:
- ✅ `vitest` - Fast unit test framework
- ✅ `@testing-library/react` - React testing utilities
- ✅ `@testing-library/jest-dom` - DOM matchers
- ✅ `date-fns` - Date manipulation library

## Running Tests

### Run All Tests
```bash
cd client
npm test
```

### Run Only useCalendar Tests
```bash
npm test useCalendar
```

### Run Tests in Watch Mode (for development)
```bash
npm test -- --watch useCalendar
```

### Run Tests Once (CI mode)
```bash
npm test -- --run useCalendar
```

### Run with Coverage
```bash
npm test -- --coverage useCalendar
```

## Test Configuration

The test setup is configured in:
- **Vitest Config**: `client/vitest.config.ts`
- **Test Setup**: `client/src/test/setup.ts`

Key configuration:
```typescript
{
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
}
```

## Test Coverage

### Test Suites (7 suites, 17 tests)

#### 1. Initial State (4 tests)
- ✅ Should initialize with current month
- ✅ Should initialize with custom initial date
- ✅ Should initialize with no selected date
- ✅ Should initialize with month view mode

#### 2. Calendar Days Computation (3 tests)
- ✅ Should return array of dates for the month grid (35-42 days)
- ✅ Should start week on Monday (weekStartsOn = 1)
- ✅ Should allow custom week start day

#### 3. Navigation (3 tests)
- ✅ Should navigate to previous month
- ✅ Should navigate to next month
- ✅ Should navigate to today

#### 4. Date Selection (1 test)
- ✅ Should select a date

#### 5. View Mode (1 test)
- ✅ Should change view mode (month/week)

#### 6. Helper Functions (3 tests)
- ✅ isCurrentMonth should return true for dates in current month
- ✅ isSelected should return true for selected date
- ✅ formatMonth should return French formatted month

#### 7. Edge Cases (2 tests)
- ✅ Should handle year boundary (December to January)
- ✅ Should handle leap year February

## Test Results

Last run: **All 17 tests PASSED ✅**

```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  2.24s
```

## Key Testing Patterns

### 1. Hook Testing with renderHook
```typescript
const { result } = renderHook(() => useCalendar({ initialDate: fixedDate }))
```

### 2. Testing State Updates with act()
```typescript
act(() => {
  result.current.goToNextMonth()
})
expect(result.current.currentMonth).toEqual(expectedMonth)
```

### 3. Date Comparison with date-fns
```typescript
expect(isSameMonth(result.current.currentMonth, new Date())).toBe(true)
```

### 4. French Locale Testing
```typescript
const formatted = result.current.helpers.formatMonth()
expect(formatted).toBe('janvier 2026')
```

## Acceptance Criteria Status

All acceptance criteria from task 1.9 are met:

- ✅ All navigation functions tested (prev/next month, goToToday)
- ✅ calendarDays returns correct date range (35-42 days)
- ✅ Edge cases tested: year boundaries, leap years
- ✅ French month names verified
- ✅ Helper functions tested (isCurrentMonth, isSelected, formatMonth)
- ✅ View mode switching tested
- ✅ Custom initial date tested
- ✅ Week start configuration tested

## Troubleshooting

### Tests not running?
1. Ensure you're in the `client` directory
2. Check that dependencies are installed: `npm install`
3. Verify vitest is installed: `npm list vitest`

### Import errors?
- The test uses path aliases configured in `tsconfig.json`
- Vitest automatically resolves these via the Vite config

### Date-related test failures?
- Tests use a fixed date (January 15, 2026) to avoid time-dependent failures
- French locale is explicitly imported from `date-fns/locale/fr`

## Related Files

- **Hook Implementation**: `client/src/hooks/useCalendar.ts`
- **Type Definitions**: `client/src/types/calendar.ts`
- **Vitest Config**: `client/vitest.config.ts`
- **Test Setup**: `client/src/test/setup.ts`

## Next Steps

Future test enhancements could include:
- Performance testing with large date ranges
- Accessibility testing for ARIA attributes
- Integration tests with Calendar components
- Snapshot testing for calendarDays output

