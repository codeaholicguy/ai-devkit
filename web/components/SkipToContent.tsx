export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-on-primary focus:font-semibold focus:rounded-lg focus:outline-2 focus:outline-offset-2 focus:outline-link"
    >
      Skip to main content
    </a>
  );
}

