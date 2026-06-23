/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#15151A',
        mist: '#6B7280',
        accent: '#4F5BFF',
        success: '#1FA463',
        danger: '#D14343',
        warn: '#C2780C',
      },
      borderRadius: {
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,20,30,0.04), 0 8px 24px -8px rgba(20,20,30,0.10)',
        card: '0 1px 3px rgba(20,20,30,0.05), 0 16px 40px -16px rgba(20,20,30,0.12)',
      },
    },
  },
  plugins: [],
};
