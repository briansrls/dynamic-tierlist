import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Payload } from 'recharts/types/component/DefaultTooltipContent';
import { MultiLineGraphDataPoint } from '../components/MainContent'; // Import from MainContent

// Define ScoreEntry interface to match backend (ScoreEntry model in main.py)
export interface ScoreEntry {
  timestamp: number; // Changed to number (epoch milliseconds)
  score_value: number;
  reason?: string | null;
  server_id?: string | null;   // Added from backend model
  message_id?: string | null;  // Added from backend model
  // Remove mock data specific fields like sc9_vs_theebis, sc9_vs_vough, user, time
}

// const currentUserDisplayName = "Stinky Cat9"; // No longer needed for mock specific lines

// For multi-line graph (all tracked users)
// MultiLineGraphDataPoint is imported, but also defined here for clarity if this component becomes standalone
// export interface MultiLineGraphDataPoint {
//   timestamp: number;
//   [userSpecificDataKey: string]: number; 
// }

export interface LineConfig {
  dataKey: string;  // e.g., "userID1_score" or "score_value" for single line
  name: string;     // Legend name, e.g., "User1"
  stroke: string;   // Color, e.g., "#8884d8"
  avatarUrl: string | null; // Added avatarUrl
}

// Helper function to round to a "nice" number for graph axes
const roundToNiceNumber = (value: number, roundUp: boolean): number => {
  if (value === 0) return 0;
  if (!isFinite(value)) return roundUp ? 100 : -10; // Default for non-finite inputs

  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
  let step = magnitude / 2; // e.g., for 1257, magnitude is 1000, step is 500

  // Adjust step for smaller numbers to get nicer rounding (e.g. 10s, 50s, 100s)
  if (magnitude >= 1000) step = magnitude / 4; // Round to 250s for thousands
  else if (magnitude >= 100) step = magnitude / 2;  // Round to 50s for hundreds
  else if (magnitude >= 10) step = magnitude / 2;   // Round to 5s for tens
  else step = magnitude; // For numbers < 10, round to nearest 1, 0.1 etc.

  // Ensure step is not zero for very small values approaching zero
  if (step === 0) step = 0.1;
  // A simpler step logic: round to a fraction of the magnitude
  // step = magnitude / 10; //  e.g. for 1257, step is 100. For 57, step is 10.
  // if (Math.abs(value) < 100 && Math.abs(value) >= 10) step = 5;
  // else if (Math.abs(value) < 10) step = 1;

  if (roundUp) {
    return Math.ceil(value / step) * step;
  }
  return Math.floor(value / step) * step;
};

// Custom Dot component for the *active* (hovered) point
const CustomActiveDot = (props: any) => {
  const { cx, cy, stroke, avatarUrl, payload, dataKey, mouseYInChart } = props;

  if (typeof cx !== 'number' || typeof cy !== 'number' || isNaN(cx) || isNaN(cy)) {
    return null;
  }

  // If mouseYInChart is available, check proximity
  const Y_THRESHOLD = 20; // Only show avatar if mouse Y is within 20px of dot's cy
  if (mouseYInChart !== null && Math.abs(cy - mouseYInChart) > Y_THRESHOLD) {
    // If mouse is too far vertically, render a standard smaller active dot or nothing
    return <circle cx={cx} cy={cy} r={6} fill={stroke} stroke="#fff" strokeOpacity={0.7} strokeWidth={1} />;
  }

  if (!avatarUrl) {
    return <circle cx={cx} cy={cy} r={8} fill={stroke} stroke="#fff" strokeOpacity={0.8} strokeWidth={2} />;
  }

  const DOT_SIZE = 28;
  const BORDER_WIDTH = 2;

  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle cx={0} cy={0} r={DOT_SIZE / 2 + BORDER_WIDTH} fill={stroke} />
      <defs>
        <clipPath id={`clip-active-${cx}-${cy}-${stroke}`}>
          <circle cx={0} cy={0} r={DOT_SIZE / 2} />
        </clipPath>
      </defs>
      <image
        x={-DOT_SIZE / 2}
        y={-DOT_SIZE / 2}
        width={DOT_SIZE}
        height={DOT_SIZE}
        href={avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
        clipPath={`url(#clip-active-${cx}-${cy}-${stroke})`}
      />
    </g>
  );
};

// Custom Dot component for the last point of a line
const CustomLastPointDot = (props: any) => {
  const { cx, cy, stroke, payload, dataKey, avatarUrl, index, data } = props;

  // If cx or cy is not a valid number, don't render the dot
  if (typeof cx !== 'number' || typeof cy !== 'number' || isNaN(cx) || isNaN(cy)) {
    // console.log(`CustomLastPointDot: Skipping render due to invalid cx/cy for ${dataKey}, index ${index}`);
    return null;
  }

  let lastDataPointIndexForLine = -1;
  if (data && data.length > 0) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][dataKey] !== null && data[i][dataKey] !== undefined) {
        lastDataPointIndexForLine = i;
        break;
      }
    }
  }

  // Uncomment this block for detailed debugging
  if (data && index >= Math.max(0, data.length - 2)) { // Log for last 2 points to reduce noise, ensure index is not negative
    console.log(
      `DotDebug (${dataKey}, dataIndex: ${index}): ` +
      `avatarUrl: ${avatarUrl ? avatarUrl : 'NULL_OR_UNDEFINED'}, ` +
      `lastDataIdxForLine: ${lastDataPointIndexForLine}, ` +
      `isLastPointMatch: ${index === lastDataPointIndexForLine}, ` +
      `cx: ${cx}, cy: ${cy}, ` +
      `payloadValue: ${payload ? payload[dataKey] : 'N/A'}`
    );
  }

  if (index === lastDataPointIndexForLine && avatarUrl) {
    console.log(`CustomLastPointDot: Rendering for ${dataKey}, index ${index}, cx=${cx}, cy=${cy}, avatar=${avatarUrl}`);
    const DOT_SIZE = 24;
    const BORDER_WIDTH = 2;
    return (
      <g transform={`translate(${cx},${cy})`}> {/* Center group on the point */}
        {/* Optional: Circle border */}
        <circle cx={0} cy={0} r={DOT_SIZE / 2 + BORDER_WIDTH} fill={stroke} opacity={0.5} />
        <circle cx={0} cy={0} r={DOT_SIZE / 2 + BORDER_WIDTH - 1} fill={props.stroke} />
        <defs>
          <clipPath id={`clip-${dataKey}-${index}`}>
            <circle cx={0} cy={0} r={DOT_SIZE / 2} />
          </clipPath>
        </defs>
        <image
          x={-DOT_SIZE / 2}
          y={-DOT_SIZE / 2}
          width={DOT_SIZE}
          height={DOT_SIZE}
          href={avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
          clipPath={`url(#clip-${dataKey}-${index})`}
        />
      </g>
    );
  }

  // Render a smaller, standard dot for other points if desired, or no dot if activeDot is used
  // Recharts Line `dot` prop can be true (default dot), false (no dots), or a custom element/function.
  // If we return null here, only activeDot will show. Let's render a small standard dot for non-last points.
  // console.log(`Rendering fallback dot for ${dataKey} at index ${index}`); // DEBUG
  return <circle cx={cx} cy={cy} r={3} stroke={stroke} fill="#fff" strokeWidth={1} />;
};

// Remove mockScoreData or keep it for fallback if data is empty, but ensure it matches new ScoreEntry
const mockScoreFallbackData: ScoreEntry[] = [
  // Example: { timestamp: new Date().toISOString(), score_value: 0, reason: "Initial (Mock)" },
];

interface ScoreGraphProps {
  data: ScoreEntry[] | MultiLineGraphDataPoint[];
  graphTitle?: string;
  lineConfigs?: LineConfig[];
  overallMinScore?: number;
  overallMaxScore?: number;
  isLoading?: boolean;
  error?: string | null; // Added error prop
}

const ScoreGraph: React.FC<ScoreGraphProps> = ({ data, graphTitle, lineConfigs, overallMinScore, overallMaxScore, isLoading, error }) => {
  const [mouseYInChart, setMouseYInChart] = useState<number | null>(null);

  const isMultiLine = lineConfigs && lineConfigs.length > 0;
  const displayData = data as (ScoreEntry[] | MultiLineGraphDataPoint[]);
  const effectiveTitle = graphTitle || (isMultiLine ? "Tracked Users Overview" : "Score History");

  // Order of precedence: Error, then Loading, then No Data, then Chart
  if (error) {
    return (
      <div className="score-graph-container" style={{ width: '100%', height: 550 }}>
        <h3>{effectiveTitle}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(500px - 40px - 30px)', padding: '20px' }} className="graph-error-internal">
          <p>Error loading scores:</p>
          <p style={{ color: '#f04747', marginTop: '5px' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="score-graph-container" style={{ width: '100%', height: 550 }}>
        <h3>{effectiveTitle}</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(500px - 40px - 30px)' }}>
          <div className="css-spinner"></div>
        </div>
      </div>
    );
  }

  const noDataAvailable = !displayData || displayData.length === 0;

  const handleChartMouseMove = (event: any) => {
    if (event && event.activeCoordinate && typeof event.activeCoordinate.y === 'number') {
      setMouseYInChart(event.activeCoordinate.y);
    } else if (event && typeof event.chartY === 'number') {
      // Fallback if activeCoordinate isn't directly available with y for plot area
      // but chartY (relative to SVG) and top margin are.
      // This requires knowing the top margin of the LineChart component.
      const chartTopMargin = 40; // As defined in LineChart margin prop
      setMouseYInChart(event.chartY - chartTopMargin);
    }
    // else {
    //  setMouseYInChart(null); // Or keep last known if preferred while mouse is still over plot
    // }
  };

  const handleChartMouseLeave = () => {
    setMouseYInChart(null);
  };

  // Tooltip formatter needs to be aware of multi-line context
  const tooltipFormatter = (value: number, name: string, item: Payload<number, string>) => {
    // For multi-line, 'name' will be the dataKey like 'USERID_score'
    // We need to find the corresponding legend name from lineConfigs
    let displayName = name;
    if (isMultiLine && lineConfigs) {
      const config = lineConfigs.find(lc => lc.dataKey === name);
      if (config) displayName = config.name;
    } else if (name === 'score_value') {
      displayName = "Score"; // Default for single line
    }

    const entryPayload = item.payload as ScoreEntry | MultiLineGraphDataPoint;
    let reasonText = '';
    // Reason is only available in ScoreEntry (single line view typically)
    if (!isMultiLine && 'reason' in entryPayload && entryPayload.reason) {
      reasonText = ` (Reason: ${entryPayload.reason})`;
    }
    return [`${displayName}: ${value}${reasonText}`, null];
  };

  return (
    <div className="score-graph-container" style={{ width: '100%', height: 550 }}>
      <h3>{effectiveTitle}</h3>
      <ResponsiveContainer width="100%" height={500} style={{ overflow: 'visible' }}>
        {noDataAvailable ? (
          <div style={{ textAlign: 'center', paddingTop: '100px', color: '#8e9297', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <p>No score data available to display.</p>
          </div>
        ) : (
          <LineChart
            data={displayData}
            margin={{ top: 40, right: 40, left: 10, bottom: 40 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(numericalTimestamp) => {
                if (typeof numericalTimestamp !== 'number' || isNaN(numericalTimestamp)) return '';
                try {
                  const date = new Date(numericalTimestamp);
                  // Always format as "Month Day", e.g., "Jan 15"
                  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                } catch (e) {
                  return 'Invalid Date';
                }
              }}
              domain={['dataMin', 'dataMax']}
              type="number"
              scale="time"
              tickMargin={10}
            // interval="preserveStartEnd" // Consider uncommenting if dates are still too dense
            />
            {/* For multi-line, YAxis might need dynamic domain or multiple axes, for now, single YAxis for scores */}
            <YAxis
              type="number"
              domain={[
                (dataMinFromData: number, dataMaxFromData: number) => {
                  if (isMultiLine && typeof overallMinScore === 'number' && typeof overallMaxScore === 'number') {
                    const range = Math.max(1, Math.abs(overallMaxScore - overallMinScore));
                    const padding = Math.max(range * 0.15, 20);
                    const paddedMin = Math.min(overallMinScore, 0) - padding;
                    return roundToNiceNumber(paddedMin, false); // Round down
                  }
                  if (typeof dataMinFromData !== 'number' || typeof dataMaxFromData !== 'number' || isNaN(dataMinFromData) || isNaN(dataMaxFromData)) {
                    return -10;
                  }
                  const range = Math.max(1, Math.abs(dataMaxFromData - dataMinFromData));
                  const padding = Math.max(range * 0.15, 20);
                  const paddedMin = Math.min(dataMinFromData, 0) - padding;
                  return roundToNiceNumber(paddedMin, false); // Round down
                },
                (dataMinFromData: number, dataMaxFromData: number) => {
                  if (isMultiLine && typeof overallMinScore === 'number' && typeof overallMaxScore === 'number') {
                    const range = Math.max(1, Math.abs(overallMaxScore - overallMinScore));
                    const padding = Math.max(range * 0.15, 20);
                    const paddedMax = overallMaxScore + padding;
                    return roundToNiceNumber(paddedMax, true); // Round up
                  }
                  if (typeof dataMinFromData !== 'number' || typeof dataMaxFromData !== 'number' || isNaN(dataMinFromData) || isNaN(dataMaxFromData)) {
                    return 100;
                  }
                  const range = Math.max(1, Math.abs(dataMaxFromData - dataMinFromData));
                  const padding = Math.max(range * 0.15, 20);
                  const paddedMax = dataMaxFromData + padding;
                  return roundToNiceNumber(paddedMax, true); // Round up
                }
              ]}
              allowDataOverflow
              dataKey={!isMultiLine ? "score_value" : undefined}
            />
            <Tooltip
              labelFormatter={(numericalTimestamp: number) => {
                if (typeof numericalTimestamp !== 'number') return '';
                try {
                  const date = new Date(numericalTimestamp);
                  return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                } catch (e) {
                  return 'Invalid Date';
                }
              }}
              formatter={tooltipFormatter}
            />
            <Legend />
            {isMultiLine && lineConfigs ? (
              lineConfigs.map(config => (
                <Line
                  key={config.dataKey}
                  type="monotone"
                  dataKey={config.dataKey}
                  stroke={config.stroke}
                  name={config.name}
                  connectNulls={true}
                  isAnimationActive={false}
                  activeDot={(activeDotProps: any) => (
                    <CustomActiveDot {...activeDotProps} avatarUrl={config.avatarUrl} mouseYInChart={mouseYInChart} />
                  )}
                  dot={(lineProps: any) => {
                    const { key, index, ...restOfDotProps } = lineProps;
                    const uniqueKey = key || `custom-dot-${config.dataKey}-${index}`;
                    // console.log(`ScoreGraph: dot render func called for line ${config.dataKey}, point index ${index}, uniqueKey ${uniqueKey}`);
                    return (
                      <CustomLastPointDot
                        key={uniqueKey}
                        {...restOfDotProps}
                        avatarUrl={config.avatarUrl}
                        dataKey={config.dataKey}
                        data={displayData}
                        index={index}
                      />
                    );
                  }}
                  strokeWidth={2}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="score_value"
                stroke="#8884d8"
                connectNulls={true}
                isAnimationActive={false}
                activeDot={{ r: 8 }}
                name="Score"
                dot={{ r: 3 }}
                strokeWidth={2}
              />
            )}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreGraph; 