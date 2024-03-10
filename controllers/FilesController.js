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
    const users = dbClient.db.collection('users');
    const objectUserId = new ObjectID(userId);
    const user = await users.findOne({ _id: objectUserId });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const {
      name,
      type,
      parentId,
      isPublic,
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
      parentId: parentId || 0,
      isPublic: isPublic || false,
    };
    const files = dbClient.db.collection('files');
    const _id = new ObjectID(parentId);
    if (parentId) {
      await files.findOne({ _id }, async (err, result) => {
        if (!result) {
          res.status(400).json({ error: 'Parent not found' });
        } else if (result.type !== 'folder') {
          res.status(400).json({ error: 'Parent is not a folder' });
        }
      });
    }
    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(file);
      res.status(201).json({ ...file, id: result.insertedId });
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const filePath = `${folderPath}/${v4()}`;
    fs.writeFile(
      filePath,
      Buffer.from(data, 'base64'),
      'utf-8',
      async (err) => {
        if (!err) {
          const result = await files.insertOne({
            ...file,
            localPath: filePath,
          });
          res.status(201).json({ ...file, id: result.insertedId });
        }
      },
    );
  }
}
module.exports = FilesController;
