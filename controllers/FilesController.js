import fs from 'fs';
import { ObjectID } from 'mongodb';
import { v4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const {
      name,
      type,
      parentId = 0,
      isPublic = false,
      data,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    const file = {
      name,
      type,
      userId,
      parentId,
      isPublic,
    };
    const files = dbClient.db.collection('files');
    if (parentId) {
      const _id = new ObjectID(parentId);
      await files.findOne({ _id }, async (err, result) => {
        if (!result) {
          res.status(400).json({ error: 'Parent not found' });
        } else if (result.type !== 'folder') {
          res.status(400).json({ error: 'Parent is not a folder' });
        }
      });
    }
    if (type === 'folder') {
      const result = await files.insertOne({ ...file });
      res.status(201).json({ ...file, id: result.insertedId.toString() });
      return;
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(folderPath, { recursive: true });
    const filePath = `${folderPath}/${v4()}`;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    const result = await files.insertOne({
      ...file,
      localPath: filePath,
    });
    res.status(201).json({ ...file, id: result.insertedId.toString() });
  }
}
module.exports = FilesController;
