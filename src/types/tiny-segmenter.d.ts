declare module 'tiny-segmenter' {
  interface TinySegmenter {
    segment(text: string): string[];
  }

  class TinySegmenter implements TinySegmenter {
    constructor();
    segment(text: string): string[];
  }

  export default TinySegmenter;
}
