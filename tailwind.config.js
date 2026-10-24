/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--c-green)',
        branddark: 'var(--c-green-dark)',
        brandsoft: 'var(--c-green-soft)',
        soft: 'var(--c-bg-soft)',
        ink: 'var(--c-text)',
        ink2: 'var(--c-text-2)',
        ink3: 'var(--c-text-3)',
        line: 'var(--c-line)',
        danger: 'var(--c-danger)',
      },
      borderRadius: {
        card: '20px',
        btn: '14px',
        field: '12px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'HarmonyOS Sans',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
