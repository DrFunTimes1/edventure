import express from 'express';
const router = express.Router();

router.get('/',  (req, res) => {
    res.sendStatus(200);
});

router.post('/api/session/open', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    if (req.session.questsGeneratedDate !== today) {
        req.session.questsGenerated = false;
    }

    res.status(204).end();
});

export default router;