declare module "fft.js" {
  export default class FFT {
    constructor(size: number);
    createComplexArray(): number[];
    transform(out: ArrayLike<number>, input: ArrayLike<number>): void;
    inverseTransform(out: ArrayLike<number>, input: ArrayLike<number>): void;
  }
}
