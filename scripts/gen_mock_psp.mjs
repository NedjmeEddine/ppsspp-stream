import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binMarkovPack = path.join(rootDir, 'bin', 'markov-pack');
const distDir = path.join(rootDir, 'dist');
const tmpDir = path.join(rootDir, '.tmp_isos');

if (!fs.existsSync(binMarkovPack)) {
    console.error(`[gen_mock_psp] ERROR: markov-pack not found at ${binMarkovPack}. Run: make server`);
    process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

function createMockPspIso(filePath, discId, title, sizeBytes = 1048576) {
    const buf = Buffer.alloc(sizeBytes, 0);
    // Sector 16 (0x8000): ISO9660 Primary Volume Descriptor
    const pvd = 0x8000;
    buf[pvd] = 0x01;
    buf.write('CD001', pvd + 1, 'ascii');
    buf[pvd + 6] = 0x01;
    buf.fill(0x20, pvd + 8, pvd + 72);
    buf.write('PSP GAME', pvd + 8, 'ascii');
    buf.write(title.slice(0, 32), pvd + 40, 'ascii');
    buf.write(discId.slice(0, 16), pvd + 883, 'ascii');

    for (let i = 0x10000; i < sizeBytes; i += 2048) {
        buf.write(`[PSP_${discId}_SECTOR_${i / 2048}]`, i, 'ascii');
    }

    fs.writeFileSync(filePath, buf);
    return filePath;
}

const gowIso = createMockPspIso(path.join(tmpDir, 'gow_coo.iso'), 'UCUS-98653', 'GOD OF WAR COO');
const ccIso = createMockPspIso(path.join(tmpDir, 'crisis_core.iso'), 'ULUS-10336', 'CRISIS CORE FF7');

for (const [id, iso] of [['gow_coo', gowIso], ['crisis_core', ccIso]]) {
    const outDir = path.join(distDir, 'games', id);
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync(binMarkovPack, [
        '-in', iso,
        '-out-dir', outDir,
        '-block-shift', '18',
        '-pack-shift', '0',
        '-pool-mb', '64',
        '-top-k', '4'
    ]);
}

const catalog = {
    version: 1,
    games: [
        {
            id: 'gow_coo',
            title: 'God of War: Chains of Olympus',
            platform: 'psp',
            discSize: 1048576,
            blockShift: 18,
            poolMb: 64
        },
        {
            id: 'crisis_core',
            title: 'Crisis Core: Final Fantasy VII',
            platform: 'psp',
            discSize: 1048576,
            blockShift: 18,
            poolMb: 64
        }
    ]
};

fs.writeFileSync(path.join(distDir, 'games.json'), JSON.stringify(catalog, null, 2));
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('Generated mock PSP UMD packs in dist/games/ and dist/games.json');
