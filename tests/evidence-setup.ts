import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

export default async function setup() {
 const directory = path.resolve('e2e-evidence');
 await rm(directory, { recursive: true, force: true });
 await mkdir(directory, { recursive: true });
}
