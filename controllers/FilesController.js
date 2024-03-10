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
    } else if (type === 'folder') {
      await dbClient.db.collection('files').insertOne(file);
      res.status(201).json(file);
    } else {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const fileName = `${folderPath}/${v4()}`;
      fs.writeFile(fileName, data, (err) => {
        console.log(err);
      });
      file.localPath = fileName;
      await dbClient.db.collection('files').insertOne(file);
      res.status(201).json(file);
    }
  }
}
module.exports = FilesController;
