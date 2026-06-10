import { Router, Response } from "express";
import fs from "fs/promises";
import prisma from "../config/database.js";
import cloudinary from "../config/cloudinary.js";
import upload from "../config/multer.js";
import authMiddleware, { AuthRequest } from "../middleware/auth.js";

const router = Router();

// All video routes are protected
router.use(authMiddleware);

// GET /api/videos — List all videos
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    res.json({ videos });
  } catch (error) {
    console.error("List videos error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /api/videos/upload — Upload a video
router.post(
  "/upload",
  upload.single("video"),
  async (req: AuthRequest, res: Response) => {
    const tempFilePath = req.file?.path;

    try {
      if (!req.file) {
        res.status(400).json({ error: "Video file is required." });
        return;
      }

      const { title } = req.body;

      if (!title) {
        // Clean up temp file if title is missing
        if (tempFilePath) {
          await fs.unlink(tempFilePath).catch(() => {});
        }
        res.status(400).json({ error: "Title is required." });
        return;
      }

      // Upload to Cloudinary
      const cloudinaryResult = await cloudinary.uploader.upload(tempFilePath!, {
        resource_type: "video",
        folder: "video-streaming-app",
      });

      // Delete temp file after successful upload
      await fs.unlink(tempFilePath!).catch(() => {});

      // Save to database
      const video = await prisma.video.create({
        data: {
          title,
          videoUrl: cloudinaryResult.secure_url,
          thumbnailUrl: cloudinaryResult.secure_url.replace(
            /\.[^.]+$/,
            ".jpg"
          ),
          cloudinaryId: cloudinaryResult.public_id,
          userId: req.userId!,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      res.status(201).json({ video });
    } catch (error) {
      console.error("Upload video error:", error);

      // Clean up temp file on error
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
      }

      res.status(500).json({ error: "Failed to upload video." });
    }
  }
);

// GET /api/videos/:id — Get single video detail
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const videoId = parseInt(req.params.id as string, 10);

    if (isNaN(videoId)) {
      res.status(400).json({ error: "Invalid video ID." });
      return;
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!video) {
      res.status(404).json({ error: "Video not found." });
      return;
    }

    res.json({ video });
  } catch (error) {
    console.error("Get video error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
