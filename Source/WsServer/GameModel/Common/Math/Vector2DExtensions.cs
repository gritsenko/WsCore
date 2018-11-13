namespace GameModel.Common.Math
{
    public static class Vector2DExtensions
    {
        public static Vector2D ToVector2D(this Matrix m)
        {
            return new Vector2D(m[0, 0], m[1, 0]);
        }

        public static Vector2D Round(this Vector2D v)
        {
            return new Vector2D((float) System.Math.Round(v.X), (float) System.Math.Round(v.Y));
        }
        public static Vector2D Floor(this Vector2D v)
        {
            return new Vector2D((float) System.Math.Floor(v.X), (float) System.Math.Floor(v.Y));
        }
        public static Vector2D PixelSnap(this Vector2D v)
        {
            return new Vector2D(((float) System.Math.Floor(v.X)) + 0.5f, ((float) System.Math.Floor(v.Y)) + 0.5f);
        }

        public static Vector2D ApplyTransform(this Vector2D v, Matrix m)
        {
            return (m * v.ToMatrix()).ToVector2D();
        }

        public static Vector2D ApplyInvertedTransform(this Vector2D v, Matrix m)
        {
            return (!m * v.ToMatrix()).ToVector2D();
        }
    }
}