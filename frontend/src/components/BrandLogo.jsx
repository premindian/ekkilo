import logoFull from '../assets/ekkilo-logo.png';
import logoIcon from '../assets/ekkilo-icon.png';

/**
 * Ekkilo brand mark (bundled so it always ships with the React build).
 * - full: scale + wordmark (headers, login)
 * - icon: scale only (nav, small buttons)
 */
export default function BrandLogo({
  variant = 'full',
  height = variant === 'icon' ? 22 : 36,
  alt = 'Ekkilo',
  style = {},
}) {
  const src = variant === 'icon' ? logoIcon : logoFull;
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
