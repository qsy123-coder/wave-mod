"use client";

import { GalleryRenderer } from "./gallery-renderer";
import { useGalleryUrlSync } from "../hooks/use-gallery-url-sync";
import type { GalleryImageResolved } from "../types";

function GalleryContent({ images }: { images: GalleryImageResolved[] }) {
  const {
    viewMode,
    activeImageIndex,
    openImage,
    dismissToGrid,
    goToNext,
    goToPrev,
  } = useGalleryUrlSync(images);

  return (
    <GalleryRenderer
      images={images}
      viewMode={viewMode}
      activeIndex={activeImageIndex}
      onImageClick={openImage}
      onDismiss={dismissToGrid}
      onNext={goToNext}
      onPrev={goToPrev}
    />
  );
}

interface GalleryClientProps {
  images: GalleryImageResolved[];
}

export function GalleryClient({ images }: GalleryClientProps) {
  return <GalleryContent images={images} />;
}