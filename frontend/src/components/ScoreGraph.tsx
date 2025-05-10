import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';

// Logged-in user (for mock data perspective)
const currentUserId = "stinky_cat9";
const currentUserDisplayName = "Stinky Cat9";

const mockScoreData = [
  { time: 'Jan', sc9_vs_theebis: 5, sc9_vs_vough: 10 },
  { time: 'Feb', sc9_vs_theebis: 0, sc9_vs_vough: 50 },
  { time: 'Mar', sc9_vs_theebis: -50, sc9_vs_vough: 200 },
  { time: 'Apr', sc9_vs_theebis: -200, sc9_vs_vough: 500 },
  { time: 'May', sc9_vs_theebis: -1000, sc9_vs_vough: 1000 },
];

const mockUserPoints = [
  { time: 'Mar', value: -50, user: 'Theebis (from SC9)', pic: 'https://via.placeholder.com/30/00BCD4/FFFFFF?Text=T' },
  { time: 'Apr', value: 500, user: 'Vough (from SC9)', pic: 'https://via.placeholder.com/30/FFC107/FFFFFF?Text=V' },
];

const CustomDot = (props: any) => {
  console.log("CustomDot props:", props);
  const { cx, cy, payload, userPic, pointTime, pointUserLabel } = props;

  if (!payload || typeof payload.time === 'undefined') {
    return (
      <g>
        <title>Error: Recharts internal data missing for this reference point.</title>
        <circle cx={cx} cy={cy} r={8} fill="#ff0000" stroke="#fff" strokeWidth={2} />
      </g>
    );
  }

  if (!userPic) {
    return <circle cx={cx} cy={cy} r={5} fill="#8884d8" stroke="#fff" strokeWidth={1} />;
  }

  const clipId = `clip-${pointTime}-${pointUserLabel?.replace(/[\s\(\)]/g, '-')}`;

  return (
    <svg x={cx - 15} y={cy - 15} width={30} height={30} viewBox="0 0 100 100">
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <image
        href={userPic}
        width="100"
        height="100"
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
};

const ScoreGraph: React.FC = () => {
  return (
    <div className="score-graph-container" style={{ width: '100%', height: 500 }}>
      <h2>Discord Social Credit</h2>
      <ResponsiveContainer>
        <LineChart data={mockScoreData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis type="number" domain={['auto', 'auto']} allowDataOverflow />
          <Tooltip
            formatter={(value: number, name: string, props: any) => [
              `Score: ${value}`,
              props.payload.user || name // Display user from mockUserPoints if available
            ]}
          />
          <Legend />
          <Line type="monotone" dataKey="sc9_vs_theebis" stroke="#8884d8" activeDot={{ r: 8 }} name={`${currentUserDisplayName} -> Theebis`} />
          <Line type="monotone" dataKey="sc9_vs_vough" stroke="#82ca9d" activeDot={{ r: 8 }} name={`${currentUserDisplayName} -> Vough`} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreGraph; 