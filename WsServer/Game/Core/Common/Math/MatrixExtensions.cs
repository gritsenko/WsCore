namespace Game.Core.Common.Math;

public static class MatrixExtensions
{
    public static void Translate(this Matrix matrix, float dx, float dy)
    {
        matrix[0, 2] += dx;
        matrix[1, 2] += dy;
    }

    public static Vector2D GetPos(this Matrix mt)
    {
        return new Vector2D(mt[0, 2], mt[1, 2]);
    }
}