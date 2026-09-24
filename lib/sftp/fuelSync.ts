import fs from 'fs';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { importFuelFile, getImportedFileNames } from '../dat/importFuel';

// Connects to the SFTP server, finds .dat files not yet in the DB, downloads
// them to a local staging dir, and imports each. Config comes from env — see
// .env.example.

export interface SftpSyncResult {
  remoteFiles: number;
  newFiles: number;
  imported: number;
  transactions: number;
  errors: { file: string; message: string }[];
}

function sftpConfig(): SftpClient.ConnectOptions {
  const host = process.env.SFTP_HOST;
  const username = process.env.SFTP_USERNAME;
  if (!host || !username) {
    throw new Error('SFTP_HOST and SFTP_USERNAME must be set');
  }
  const keyPath = process.env.SFTP_PRIVATE_KEY_PATH;
  return {
    host,
    port: Number(process.env.SFTP_PORT || 22),
    username,
    // Prefer a private key when provided, otherwise fall back to a password.
    ...(keyPath
      ? { privateKey: fs.readFileSync(keyPath) }
      : { password: process.env.SFTP_PASSWORD }),
  };
}

export async function syncFuelFromSftp(): Promise<SftpSyncResult> {
  const remoteDir = process.env.SFTP_REMOTE_DIR || '/';
  const stagingDir =
    process.env.SFTP_STAGING_DIR ||
    path.join(process.cwd(), 'data', 'sftp-incoming');
  fs.mkdirSync(stagingDir, { recursive: true });

  const result: SftpSyncResult = {
    remoteFiles: 0,
    newFiles: 0,
    imported: 0,
    transactions: 0,
    errors: [],
  };

  const sftp = new SftpClient();
  await sftp.connect(sftpConfig());
  try {
    const listing = await sftp.list(remoteDir);
    const remoteDatFiles = listing
      .filter((e) => e.type === '-' && e.name.toLowerCase().endsWith('.dat'))
      .map((e) => e.name);
    result.remoteFiles = remoteDatFiles.length;

    const alreadyImported = await getImportedFileNames();
    const newFiles = remoteDatFiles.filter((n) => !alreadyImported.has(n));
    result.newFiles = newFiles.length;

    for (const name of newFiles) {
      const localPath = path.join(stagingDir, name);
      try {
        await sftp.fastGet(`${remoteDir.replace(/\/$/, '')}/${name}`, localPath);
        const { inserted } = await importFuelFile(localPath);
        result.imported += 1;
        result.transactions += inserted;
      } catch (err) {
        result.errors.push({ file: name, message: (err as Error).message });
      }
    }
  } finally {
    await sftp.end();
  }

  return result;
}
