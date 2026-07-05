/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'IBM Plex Sans Arabic', 'sans-serif'],
        display: ['Cairo', 'IBM Plex Sans Arabic', 'sans-serif'],
      },
      colors: {
        // الكحلي العميق - اللون الأساسي الرسمي
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
        },
        // الذهبي - لون التمييز
        gold: {
          50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047',
          400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207',
          800: '#854d0e', 900: '#713f12',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 10px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
        'elegant': '0 4px 20px -2px rgb(30 58 138 / 0.08), 0 2px 8px -2px rgb(30 58 138 / 0.04)',
        'soft': '0 2px 12px -2px rgb(0 0 0 / 0.06)',
        'tile': '0 2px 8px -2px rgb(30 58 138 / 0.12)',
        'tile-hover': '0 8px 24px -4px rgb(30 58 138 / 0.20)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)',
        'gradient-gold': 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
        'gradient-subtle': 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
        'gradient-navy': 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
