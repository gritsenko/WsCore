namespace GameModel
{
    public enum ObjectClass
    {
        Tree = 0,
        Rock = 1,
    }

    public class ObjectType
    {
        public long Id;
        public ObjectClass ObjectClass;
        public int Width;
        public int Height;
    }
}