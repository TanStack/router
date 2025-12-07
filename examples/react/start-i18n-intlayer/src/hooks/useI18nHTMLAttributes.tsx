import { getHTMLTextDir } from 'intlayer';
import { useEffect } from 'react';
import { useLocale } from 'react-intlayer';

/**
 * Updates the HTML <html> element's `lang` and `dir` attributes based on the current locale.
 * - `lang`: Informs browsers and search engines of the page's language.
 * - `dir`: Ensures the correct reading order (e.g., 'ltr' for English, 'rtl' for Arabic).
 *
 * This dynamic update is essential for proper text rendering, accessibility, and SEO.
 */
export const useI18nHTMLAttributes = () => {
  const { locale } = useLocale();

  useEffect(() => {
    // Update the language attribute to the current locale.
    document.documentElement.lang = locale;

    // Set the text direction based on the current locale.
    document.documentElement.dir = getHTMLTextDir(locale);
  }, [locale]);
};
