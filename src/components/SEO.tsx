import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  type?: string;
  image?: string;
}

const SITE_NAME = 'WaterSki Predictor';
const BASE_URL = 'https://waterskipredictor.com';
const DEFAULT_IMAGE = `${BASE_URL}/og-default.jpg`;
const DEFAULT_DESC = 'Free waterski prediction game powered by IWWF rankings. Pick winners for slalom, trick & jump at pro tour events, earn tokens, and compete with other fans.';

export const SEO = ({
  title,
  description = DEFAULT_DESC,
  path = '',
  type = 'website',
  image,
}: SEOProps) => {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Fantasy Waterski Predictions & Picks`;
  const resolvedPath = path || (typeof window !== 'undefined' ? window.location.pathname : '');
  const url = `${BASE_URL}${resolvedPath}`;
  const ogImage = image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
  );
};
