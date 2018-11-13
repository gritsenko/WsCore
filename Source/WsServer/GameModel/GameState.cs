using System;
using System.Collections.Generic;
using System.Linq;
using GameModel.Common.Math;

namespace GameModel
{

    public class GameState
    {
        public World World;

        public Dictionary<uint, Player> players { get; set; } = new Dictionary<uint, Player>();
        private Dictionary<string, int> players_top { get; set; } = new Dictionary<string, int>();

        public string top { get; set; }

        public GameState()
        {
            World = new World();
            //_npcProcessor = new NpcProcessor();
            //_players = new Players();

            InitTestState();
        }

        private void InitTestState()
        {
            for (int i = 0; i < 100; i++)
            {
                var p = CreateNewPlayer(true);
                players[p.Id] = p;
            }
        }

        public Player CreateNewPlayer(bool isBot = false)
        {
            var r = new Random();
            var p = isBot ? new SimpleBot() : new Player();

            p.Id = GetNewId();
            p.Movment = new PlayerMovmentState()
            {
                Pos = new Vector2D((float)(r.NextDouble() * 800), (float)(r.NextDouble() * 600)),
                BodyAngle = (int) (r.NextDouble() * 360),
                ControlsState = 0
            };
            p.Hp = 100;
            p.Maxhp = 100;
        
            p.Name = "Player " + p.Id;

            if (isBot)
                p.Name = "@" + p.Name;
            return p;
        }

        private uint _lastId { get; set; }

        public uint GetNewId()
        {
            _lastId++;
            return _lastId;
        }

        public void UpdatePlayers(float dt)
        {
            lock (players)
            {
                foreach (var bot in players.Values)
                {
                    bot.Update(dt);
                }
            }
        }

        public void RemovePlayer(uint id)
        {
            lock (players)
            {
                if (players.ContainsKey(id))
                    players.Remove(id);
            }
        }

        public void AddPlayer(Player player)
        {
            lock (players)
            {
                players[player.Id] = player;
            }

            lock (players_top)
            {
                if (!players_top.ContainsKey(player.Name))
                    players_top[player.Name] = 0;
            }
        }

        public Player[] GetPlayers()
        {
            Player[] result = null;
            lock (players)
            {
                result = players.Values.ToArray();
            }
            return result;
        }

        public Player HitPlayer(uint id, int hitPoint, uint hitter)
        {
            var p1 = GetPlayer(id);
            var p2 = GetPlayer(hitter);

            if (p1.Hit(hitPoint))
            {
                AddFrag(p1, -1);

                if (id != hitter)
                    AddFrag(p2, 2);
            }

            return p1;
        }

        public Player GetPlayer(uint id)
        {
            Player p;
            lock (players)
            {
                players.TryGetValue(id, out p);
            }

            return p;
        }

        private void AddFrag(Player player, int value = 1)
        {
            player.AddFrag(value);

            lock (players_top)
            {
                if (!players_top.ContainsKey(player.Name))
                    players_top[player.Name] = 0;

                players_top[player.Name] += value;
            }
        }

        public Player RespawnPlayer(uint id)
        {
            var r = new Random();
            var p = GetPlayer(id);

            if (p != null)
            {
                p.Hp = 100;
                p.SetPos((float) (r.NextDouble()*1700), (float) (r.NextDouble()*960));
            }
            return p;
        }

        public void SetPlayerName(uint id, string name)
        {
            var p = GetPlayer(id);
            if (string.IsNullOrEmpty(name))
            {
                name = "Player " + p.Id;
            }

            p.Name = name;

            p.UpdateActivity();
        }

        public Player MovePlayer(uint id, float x, float y)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.SetPos(x, y);
                p.UpdateActivity();
            }
            return p;
        }
        public Player SetPlayerTarget(uint id, float x, float y)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.SetTarget(x, y);
                p.UpdateActivity();
            }
            return p;
        }

        public void UpdatePlayerActivity(uint id)
        {
            var p = GetPlayer(id);
            p.UpdateActivity();
        }

        public Player SetPlayerControls(uint id, Vector2D aim, int contols)
        {
            var p = GetPlayer(id);
            if (p != null)
            {
                p.Movment.ControlsState = contols;
                p.Movment.AimPos = aim;
                p.UpdateActivity();
            }
            return p;
        }
    }
}