import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@rspress/core/runtime';

type Preview = { src: string; alt: string };
const imageSelector = '.gallery-card img, .home-showcase img, .screenshot-frame img, .rp-doc img[src*="/gallery/"]';

export default function GalleryLightbox() {
  const { pathname } = useLocation();
  const [preview, setPreview] = useState<Preview | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const source = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPreview(null);
    const images = new Set<HTMLImageElement>();
    const decorate = () => {
      for (const image of document.querySelectorAll<HTMLImageElement>(imageSelector)) {
        if (images.has(image)) continue;
        images.add(image);
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', `Enlarge: ${image.alt}`);
        image.setAttribute('aria-haspopup', 'dialog');
        if (!image.closest('.home-showcase')) image.loading = 'lazy';
      }
    };
    decorate();
    // Client-side document navigation can mount MDX after this component.
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    const open = (target: EventTarget | null) => {
      if (!(target instanceof HTMLImageElement) || !target.matches(imageSelector)) return false;
      source.current = target;
      setPreview({ src: target.currentSrc || target.src, alt: target.alt });
      return true;
    };
    const onClick = (event: MouseEvent) => { if (open(event.target)) event.preventDefault(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && open(event.target)) event.preventDefault();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      for (const image of images) {
        image.removeAttribute('tabindex');
        image.removeAttribute('role');
        image.removeAttribute('aria-label');
        image.removeAttribute('aria-haspopup');
      }
    };
  }, [pathname]);

  useEffect(() => {
    if (preview && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [preview]);

  function close() {
    dialog.current?.close();
    setPreview(null);
    source.current?.focus();
  }

  if (!preview) return null;
  return (
    <dialog ref={dialog} className="gallery-lightbox" aria-label="Screenshot preview"
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="gallery-lightbox__panel">
        <div className="gallery-lightbox__toolbar">
          <span>UI Gallery</span>
          <button type="button" onClick={close} aria-label="Close screenshot preview">Close <kbd>Esc</kbd></button>
        </div>
        <div className="gallery-lightbox__image"><img src={preview.src} alt={preview.alt} /></div>
        <p>{preview.alt}</p>
      </div>
    </dialog>
  );
}
