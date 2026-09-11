import { AnyoPlayerError } from '../errors.js'
import type { AnyoPlayerScreenshotOptions, AnyoPlayerScreenshotResult } from '../types.js'

export class ScreenshotController {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async capture(
    canvas: HTMLCanvasElement,
    render: (() => void) | undefined,
    options: AnyoPlayerScreenshotOptions = {},
  ): Promise<AnyoPlayerScreenshotResult> {
    const type = options.type ?? 'image/png'
    const quality = options.quality
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) {
      throw new TypeError('Screenshot type must be image/png, image/jpeg, or image/webp.')
    }
    if (quality !== undefined && (!Number.isFinite(quality) || quality < 0 || quality > 1)) {
      throw new TypeError('Screenshot quality must be a finite number between 0 and 1.')
    }

    try {
      render?.()
      const blob = await this.captureBlob(canvas, type, quality)
      return {
        blob,
        type: blob.type || type,
        width: canvas.width,
        height: canvas.height,
        createdAt: this.now().toISOString(),
      }
    } catch (cause) {
      if (cause instanceof AnyoPlayerError) throw cause
      throw new AnyoPlayerError(
        'PLAYER_SCREENSHOT_FAILED',
        'Anyo Player could not capture the current canvas frame.',
        { cause },
      )
    }
  }

  private captureBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    if (typeof canvas.toBlob !== 'function') {
      throw new AnyoPlayerError(
        'PLAYER_SCREENSHOT_UNAVAILABLE',
        'Canvas screenshot capture is unavailable in this browser.',
      )
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new AnyoPlayerError(
          'PLAYER_SCREENSHOT_FAILED',
          'The browser returned an empty screenshot.',
        ))
      }, type, quality)
    })
  }
}
