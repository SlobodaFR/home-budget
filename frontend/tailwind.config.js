/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        mute: '#707072',
        surface: '#fdf8f8',
        'soft-cloud': '#F5F5F5',
        hairline: '#CACACB',
        'hairline-soft': '#E5E5E5',
        success: '#007D48',
        error: '#ba1a1a',
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
      spacing: {
        md: '12px',
        'margin-mobile': '20px',
        lg: '18px',
        section: '48px',
        'margin-desktop': '40px',
        xl: '24px',
        sm: '8px',
        gutter: '16px',
      },
      fontFamily: {
        'label-caps': ['Inter', 'sans-serif'],
        'heading-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'heading-xl': ['Inter', 'sans-serif'],
        'display-campaign': ['Anton', 'sans-serif'],
        'button-md': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
      },
      fontSize: {
        'label-caps': ['12px', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '700' }],
        'heading-lg': ['24px', { lineHeight: '1.2', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'heading-xl': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'display-campaign-mobile': ['56px', { lineHeight: '0.9', fontWeight: '500' }],
        'display-campaign': ['96px', { lineHeight: '0.9', fontWeight: '500' }],
        'button-md': ['16px', { lineHeight: '1.5', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '1.4', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};
