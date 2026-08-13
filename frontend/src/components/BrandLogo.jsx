/**
 * Ekkilo brand mark. White background was stripped to transparency in /public assets.
 * - full: scale + wordmark (headers, login)
 * - icon: scale only (nav, small buttons)
 */
export default function BrandLogo({
  variant = 'full',
  height = variant === 'icon' ? 22 : 36,
  alt = 'Ekkilo',
  style = {},
}) {
  const src = variant === 'icon' ? '/ekkilo-icon.png' : '/ekkilo-logo.png';
  return (
    <img
      src={src}
      alt={alt}
      height={height}
      style={{
        height,
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
