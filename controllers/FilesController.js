import fs from 'fs';
import { ObjectID } from 'mongodb';
import { v4 } from 'uuid';
import mime from 'mime-types';
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

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const user = await redisClient.get(key);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { parentId, page = 0 } = req.query;
    const files = dbClient.db.collection('files');
    let query;
    if (!parentId) {
      query = { userId: ObjectID(user) };
    } else {
      query = { parentId: ObjectID(parentId), userId: ObjectID(user) };
    }
    const result = await files.aggregate([
      { $match: query },
      { $skip: parseInt(page, 10) * 20 },
      { $limit: 20 },
    ]).toArray();
    const newArr = result.map(({ _id, localPath, ...rest }) => ({ id: _id, ...rest }));
    delete newArr.localPath;
    res.status(200).json(newArr);
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(file);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    file.isPublic = true;
    res.json(file);
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const objectId2 = new ObjectID(userId);
    const file = await files.findOne({ _id: objectId, userId: objectId2 });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    file.isPublic = false;
    res.json(file);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const files = dbClient.db.collection('files');
    const objectId = new ObjectID(id);
    const file = await files.findOne({ _id: objectId });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId || (!file.isPublic && file.userId !== userId)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (file.type === 'folder') {
      res.status(404).json({ error: "A folder doesn't have content" });
      return;
    }
    if (!fs.existsSync(file.localPath)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    const fileData = fs.readFileSync(file.localPath);
    res.send(fileData);
  }
}
module.exports = FilesController;
