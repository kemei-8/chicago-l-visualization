// mapScript.js

// Define the size of the map
const width = window.innerWidth;
const height = window.innerHeight; 
var proj_scale = 800000;
var projX = width/2;
var projY = height/2;
var yearToDisplay = 2023;
var aggData;
var onHover = d3.select('body').append('div')   
                    .style("height", 3+"em")
                    .style("position", "absolute")
                    .style("background-color", "whitesmoke")
                    .style("opacity", 0.9)
                    .style("border-color", "black")
                    .style("border-style", "solid")
                    .style("border-width", 1+"px")
                    .style("padding", 0.5+"em")
                    .style("visibility", "hidden");
var cursor = []; // Cursor coords at any time

// Create an SVG container
const svg = d3.select('body').append('svg')
    .attr('width', width)
    .attr('height', height);

// Initial projection
const projection = d3.geoMercator()  
    .center([-87.610073, 41.880857]) // Adjusted center for the Chicagoland region
    .scale(proj_scale) // Zoom in on Chicagoland region
    .translate([projX, projY]);

// Set up the tile generator
var tile = d3.tile()
  .size([width, height])
  .scale(proj_scale* 2 * Math.PI) // * 2 * Math.PI
  .translate(projection([0, 0]))

// Generate tiles
var tiles = tile();

// Function for generating tile URLs
function url(x, y, z) {
  // Return tile URL
  return `https://tiles.stadiamaps.com/tiles/stamen_toner_lite/${z}/${x}/${y}.png`
}

// IMPLEMENT ZOOMING/DRAGGING (buggy) -----------------------------------------------------
function zoomIn() {
  // handle scaling, translating
  // const [cursorX, cursorY] = d3.mouse(this);
  // console.log("Mouse Coords: ", [cursorX, cursorY])

  const newTransform = d3.event.transform;

  // scale/translate current projection
  var newScale = proj_scale*newTransform.k;
  // const newCenter = projection.invert([cursorX, cursorY]);

  projection // 41.880857, -87.610073
    .center([-87.610073, 41.880857]) // Adjusted center for the Chicagoland region
    .scale(newScale) // Zoom in on Chicagoland region
    .translate([projX + newTransform.x, projY + newTransform.y]);

  // Update the map tiles and circles based on the new projection
  updateMap(newScale, newTransform.x, newTransform.y);
  updateVisualization(aggData, yearToDisplay, svg);
  // updateVisualization()
}

const zoom = d3.zoom()
  .scaleExtent([1, 10]) // min/max zoom levels
  .extent([[0, 0], [width, height]])
  .on("zoom", zoomIn);

// Apply zoom behavior to SVG container
svg.call(zoom);

// END OF ZOOMING CODE ----------------------------------------------------------

// Function to update map tiles and circles
function updateMap(newScale, newX, newY) {
    // Set up the tile generator
    tile = d3.tile()
        .size([width, height])
        .scale(newScale* 2 * Math.PI) // * 2 * Math.PI
        .translate(projection([0, 0]))
    tiles = tile(); // Regenerate tiles based on the updated projection
    // Update map tiles
    svg.selectAll('image')
    .data(tiles)
    .join(
        enter => enter.append('image')
        .attr('xlink:href', d => url(d[0], d[1], d[2]))
        .attr('x', d => Math.round((d[0] + tiles.translate[0]) * tiles.scale))
        .attr('y', d => Math.round((d[1] + tiles.translate[1]) * tiles.scale))
        .attr('width', tiles.scale)
        .attr('height', tiles.scale),
        update => update
        .attr('xlink:href', d => url(d[0], d[1], d[2]))
        .attr('x', d => Math.round((d[0] + tiles.translate[0]) * tiles.scale))
        .attr('y', d => Math.round((d[1] + tiles.translate[1]) * tiles.scale))
        .attr('width', tiles.scale)
        .attr('height', tiles.scale),
        exit => exit.remove()
    );

    // document.body.appendChild(svg.node());
    // Update circles based on the updated projection
    svg.selectAll('circle')
      .attr('cx', d => projection([d.value.longitude, d.value.latitude])[0])
      .attr('cy', d => projection([d.value.longitude, d.value.latitude])[1]);
}

// Create a path generator
// const path = d3.geoPath().projection(projection);

// d3.json('illinois-counties.geojson').then(illinois => {
//     // Draw the map with debugging styles
//     svg.selectAll('path')
//         .data(illinois.features)
//         .enter().append('path')
//         .attr('d', path)
//         .style('fill', 'none') // Set fill to none for debugging
//         .style('stroke', 'red'); // Set a red stroke color for debugging
// });

// Load your CSV data with ridership information
d3.csv('ridership_with_locs-2.csv').then(data => {
    // Add event listener for the slider
    const slider = document.getElementById('year-slider');
    const selectedYear = document.getElementById('selected-year');
    // const clickedYear = document.getElementById('year-clicked')
    var year = 2023;
    var startYear = 2017;
    var endYear = 2023;
    var stations = [];
    var station_names = [];
    var coords = []

    // Convert month_beginning column to date objects
    data.forEach(d => {
        d.month_beginning = new Date(d.month_beginning);
    });

    // Update the year displayed by slider
    // slider.addEventListener('input', function() {
    //     year = this.value;
    //     selectedYear.textContent = year;
    //     // updateVisualization(data, +year);
    // });

    // Aggregate data by station
    const aggregatedData = d3.nest()
    .key(d => d.station_id)
    .rollup(stationGroup => ({
      station_name: stationGroup[0].stationame,
      totalRidership: d3.sum(stationGroup, d => +d.avg_weekday_rides),
      latitude: +stationGroup[0].latitude,
      longitude: +stationGroup[0].longitude,
      station_id: +stationGroup[0].station_id,
      years: d3.nest() // Calculates total ridership per year
        .key(d => d.month_beginning.getFullYear())
        .rollup(yearGroup => ({
          yearlyTotal: d3.sum(yearGroup, d => +d.monthtotal),
        }))
        .entries(stationGroup),
    }))
    .entries(data);

    aggData = aggregatedData;

    // Find the highest yearly total, across all stations (only during that year)
    const yearlyTotalsForYear = aggregatedData
                                .map(station => ({
                                  yearlyTotal: station.value.years.find(yr => yr.key == year)?.value.yearlyTotal || 0,
                                }));
    const highestYearlyTotal = d3.max(yearlyTotalsForYear, d => d.yearlyTotal);

    // Scale for circle size based on total ridership
    const sizeScale = d3.scaleSqrt()
        .domain([0, highestYearlyTotal])
        .range([2, 10]); // Adjust the range for desired circle sizes

    // CREATE MAP IN DESIRED AESTHETIC
    svg.selectAll('image')
        .data(tiles)
        .enter().append('image')
        .attr('xlink:href', d => url(d[0], d[1], d[2]))
        .attr('x', d => Math.round((d[0] + tiles.translate[0]) * tiles.scale))
        .attr('y', d => Math.round((d[1] + tiles.translate[1]) * tiles.scale))
        .attr('width', tiles.scale)
        .attr('height', tiles.scale);

    // Example of using the map in the document
    document.body.appendChild(svg.node());

    const defs = svg.append('defs');

    
    document.addEventListener('mousemove', function(event) {
      // Get the cursor coordinates
      cursor = [event.pageX, event.pageY];
    });

    // Map the aggregated data to the stations on the map
    svg.selectAll('circle')
        .data(aggregatedData)
        .enter().append('circle')
        .attr("station_id", d=>d.value.station_id) // Add station ids so they're more easily identifiable when hovering over legend
        .attr("class", "circle")
        .attr('cx', d => projection([d.value.longitude, d.value.latitude])[0])
        .attr('cy', d => projection([d.value.longitude, d.value.latitude])[1])
        .attr('r', d => {const yearlyTotal = d.value.years.find(yr => yr.key == year).value.yearlyTotal;
                         return sizeScale(yearlyTotal);
                        })
                        .style('stroke', 'black')
                        .style('stroke-width', 1)
                        .style('fill', d => {
                          const linesForYear = getUniqueLines(data, d.value.station_id)
                              .map(line => getBackgroundColor(line));
                      
                          // Generate a unique ID for the gradient
                          const gradientId = `gradient-${d.value.station_id}`;
                          
                          // Create a linear gradient
                          const linearGradient = defs
                              .append('linearGradient')
                              .attr('id', gradientId)
                              .attr('gradientTransform', 'rotate(0)'); // Rotate the gradient if needed
                          
                          // Add stops for each color with hard stops
                          linesForYear.forEach((color, i) => {
                              linearGradient.append('stop')
                                  .attr('offset', `${i * (100 / linesForYear.length)}%`)
                                  .style('stop-color', color);
                              
                              if (i < linesForYear.length - 1) {
                                  // Add hard stops between colors
                                  const midOffset = (i + 0.5) / (linesForYear.length - 1) * 100;
                                  linearGradient.append('stop')
                                      .attr('offset', `${midOffset}%`)
                                      .style('stop-color', color)
                                      .style('stop-opacity', 1); // Make the hard stop transparent
                              }
                          });
                      
                          // Use the gradient in the circle fill
                          return `url(#${gradientId})`;
                      })
       
        .style('opacity', 1) // Adjust the circle opacity
        .on('click', (event, d) => {
          console.log("event: ",event);
          // INCLUDE NEXT 2 LINES IF DON'T WANT STATION-STATION OVERLAY
          // stations.pop();
          // station_names.pop();

          const index_if_exists = stations.indexOf(event.value.station_id);
          const index_if_exists2 = station_names.indexOf(event.value.station_name);
          
          if (index_if_exists !== -1){ // station already exists
            // remove at this index
            stations.splice(index_if_exists, 1);
            station_names.splice(index_if_exists2, 1)
            coords.splice(index_if_exists, 1);
          } else {
            stations.push(event.value.station_id);
            station_names.push(event.value.station_name);
            coords.push([event.value.latitude, event.value.longitude]);
          }
          

          // Call a function to update the plot based on the clicked station
          updatePlot(data, stations, station_names, startYear, endYear, aggregatedData);

          // Create colored line tags
          createLineTags(data, stations[stations.length-1]); // NEEDS UPDATING
        })
        .on("mouseover", (event, d) => {
          onHover.html(`Station: ${event.value.station_name} <br>`)
                 .style("left", cursor[0] + "px") // d.geometry.coordinates[0]
                 .style("top", cursor[1] + "px")
                 .attr("class", "tooltip")
                 .style("z-index", 8)
                 .style("visibility", "visible");

          createLineTagsTooltip(data, event.key, onHover);
        })
        .on("mouseout", function (event, d) {
          // Hide tooltip
          d3.select(".tooltip")
            .style("visibility", "hidden");
        });


    // START OF DOUBLE SLIDER CODE -------------------------------------------------------
    const range = document.querySelector(".range-selected");
    // const range = document.getElementById("range-selected");
    const rangeInput = document.querySelectorAll(".two-ranges input"); // Get both ranges
    const min = document.getElementById("selected-min");
    const max = document.getElementById("selected-max");

    rangeInput.forEach((input) => {
      input.addEventListener("input", (e) => {
        startYear = parseInt(rangeInput[0].value);
        endYear = parseInt(rangeInput[1].value);

        min.textContent = startYear;
        max.textContent = endYear;

        // Everything between the sliders is filled blue
        range.style.left = (startYear - 2001+0.5)/23 * 100 + "%";
        range.style.right = (2023 - endYear)/23 * 100 + "%";

        // Update the plot in the box if a station was defined/clicked
        if (stations) {
          updatePlot(data, stations, station_names, startYear, endYear, aggregatedData);
        }
      });

    });
    // END OF DOUBLE SLIDER CODE -------------------------------------------------------

    // Update the year displayed by slider
    // slider.addEventListener('input', function () {
    //   updateVisualization(aggregatedData, +year, svg);
    // });

    // Update plot inside whenever box is resized --------------------------------------
    // resizeable element
    const bodyBox = document.getElementById('body-box');

    // Create a new ResizeObserver
    const resizeObserver = new ResizeObserver(entries => {
      // called whenever the observed element is resized
      if (stations) {
        updatePlot(data, stations, station_names, startYear, endYear, aggregatedData);
      }
    });

    resizeObserver.observe(bodyBox);
    // END resizing box update ---------------------------------------------------------

});

// Function to update the visualization based on the selected year
function updateVisualization(aggregatedData, year, svg) {
  // Extract yearly totals for the target year from each station
  const yearlyTotalsForYear = aggregatedData
    .map(station => ({
      yearlyTotal: station.value.years.find(yr => yr.key == year)?.value.yearlyTotal || 0,
    }));
  const highestYearlyTotal = d3.max(yearlyTotalsForYear, d => d.yearlyTotal);

  // Scale for circle size based on total ridership
  const sizeScale = d3.scaleSqrt()
  .domain([0, highestYearlyTotal])
  .range([2, 20]); // Adjust the range for desired circle sizes

  // Color scale for fill color based on total ridership
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
  .domain([0, highestYearlyTotal]);

  // Map the aggregated data to the stations on the map
  svg.selectAll('circle')
      .data(aggregatedData)
      .join(
          enter => enter.append('circle')
              .attr('class', 'circle')
              .attr('cx', d => projection([d.value.longitude, d.value.latitude])[0])
              .attr('cy', d => projection([d.value.longitude, d.value.latitude])[1])
              .attr('r', d => {
                  const yearlyTotal = d.value.years.find(yr => yr.key == year)?.value.yearlyTotal || 0;
                  return sizeScale(yearlyTotal);
              })
              .style('fill', d => {
                  const yearlyTotal = d.value.years.find(yr => yr.key == year)?.value.yearlyTotal || 0;
                  return colorScale(yearlyTotal);
              })
              .style('opacity', 0.7),
          update => update
              .attr('r', d => {
                  const yearlyTotal = d.value.years.find(yr => yr.key == year)?.value.yearlyTotal || 0;
                  return sizeScale(yearlyTotal);
              })
              .style('stroke', 'black')
                        .style('stroke-width', 1)
              .style('fill', d => {
                const linesForYear = getUniqueLines(data, d.value.station_id) //data --> aggregatedData?
                    .map(line => getBackgroundColor(line));
            
                // Generate a unique ID for the gradient
                const gradientId = `gradient-${d.value.station_id}`;
                
                // Create a linear gradient
                const linearGradient = defs
                    .append('linearGradient')
                    .attr('id', gradientId)
                    .attr('gradientTransform', 'rotate(0)'); // Rotate the gradient if needed
                
                // Add stops for each color with hard stops
                linesForYear.forEach((color, i) => {
                    linearGradient.append('stop')
                        .attr('offset', `${i * (100 / linesForYear.length)}%`)
                        .style('stop-color', color);
                    
                    if (i < linesForYear.length - 1) {
                        // Add hard stops between colors
                        const midOffset = (i + 0.5) / (linesForYear.length - 1) * 100;
                        linearGradient.append('stop')
                            .attr('offset', `${midOffset}%`)
                            .style('stop-color', color)
                            .style('stop-opacity', 1); // Make the hard stop transparent
                    }
                });
            
                // Use the gradient in the circle fill
                return `url(#${gradientId})`;
            }),
          exit => exit.remove()
      );
}

// colorscale for generating new color for legend on plot
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
// function to update plot
function updatePlot(data, stations, names, startYear, endYear, aggregatedData) {
  
  // Want to display multiple years' worth of month data
  const plotBox = d3.select('#plot-box');
  var rect = plotBox.node().getBoundingClientRect(); // get its computed size
  // console.log(plotBox);
  plotBox.html(''); // Clear previous content

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yearRange = d3.range(startYear, endYear+1); // [startYear, ..., endYear]
  const totalMonths = 12 * (endYear - startYear + 1);

  const xScale = d3.scaleLinear()
    .domain([1, totalMonths]) // was .domain([1, 12])
    .range([0, rect.width*0.85]);

  const xAxis = d3.axisBottom(xScale)
    .tickValues(d3.range(1, totalMonths + 1, Math.ceil(totalMonths / 10))) // 10 --> about 10 tick marks
    .tickFormat(month => { 
      const yr = yearRange[Math.floor((month - 1) / 12)]; // Calculate the year
      const monthInYear = (month - 1) % 12; // Calculate the month within the year
      return `${monthNames[monthInYear]} ${yr}`;
    });

  // const yScale = d3.scaleLinear()
  // .domain([0, d3.max(monthtotals)])
  // .range([rect.height*0.87, 0 + rect.height*0.15]);

  // Make SVG container
  const svgPlot = plotBox.append('svg')
    .attr('width', rect.width)
    .attr('height', rect.height);

  // Add x-axis
  svgPlot.append("g")
  .attr("transform", "translate(" + rect.width/10 + "," + (rect.height/1.15) + ")")
  .call(xAxis)
  .selectAll("text") // Select all x-axis text elements
  .style("text-anchor", "end") // Set text-anchor to "end"
  .attr("dx", "-.8em") // Adjust x position
  .attr("dy", ".15em") // Adjust y position
  .attr("transform", "rotate(-45)"); // Rotate the text
  
  // Try to get same y-axis for all stations plotted
  var name;
  var max_monthtotals=0;
  stations.forEach((station, index) => {
    name = names[index]; // not used rn
    // Filter data for the clicked station and selected year
    const stationData = data.filter(d => {
      const dataYear = d.month_beginning.getFullYear();
      return d.station_id == station && dataYear >= startYear && dataYear <= endYear;
    });

    // Sort stationData based on month_beginning
    stationData.sort((a, b) => a.month_beginning - b.month_beginning);

    // Update the current monthtotals
    const monthtotals = stationData.map(d => +d.monthtotal);
    const max_val = d3.max(monthtotals);
    if (max_val > max_monthtotals){
      max_monthtotals = max_val;
    }
  });

  const yScale = d3.scaleLinear()
    .domain([0, max_monthtotals])
    .range([rect.height*0.87, 0 + rect.height*0.15]);

  // Add y-axis
  svgPlot.append("g")
    .attr("transform", "translate(" + (0.1 * rect.width) + ",0)") // Adjust the x translation
    .call(d3.axisLeft(yScale));

  stations.forEach((station, index) => {
    const newColor = colorScale(index); // color of line graph
    const stationData = data.filter(d => {
      const dataYear = d.month_beginning.getFullYear();
      return d.station_id == station && dataYear >= startYear && dataYear <= endYear;
    });
    stationData.sort((a, b) => a.month_beginning - b.month_beginning);

    // Plot the points on the graph in the box
    svgPlot.append('g')
      .selectAll("dot")
      .data(stationData)
      .enter()
      .append("circle")
      .attr("cx", (d) => {const m = d.month_beginning.getMonth() + 1;
                          // month_in_range: e.g. month 35, 36, 37... of all the months we plot
                          const month_in_range = 12*(d.month_beginning.getFullYear() - startYear) + m; 
                          return xScale(month_in_range);
                         } 
        )
      .attr("cy", (d) => {const monthTot = d.monthtotal;
                          // console.log(yScale(monthTot));
                          return yScale(monthTot);
                         } )
      .attr("transform", "translate("+rect.width/10+",0)")
      .style('fill',newColor)
      .attr("r", 2);

    var line = d3.line()
        .x(function(d) {
            const m = d.month_beginning.getMonth() + 1;
            const month_in_range = 12*(d.month_beginning.getFullYear() - startYear) + m;
            return xScale(month_in_range);
        })
        .y(function(d) {
            const monthTot = d.monthtotal;
            return yScale(monthTot);
        })
        .curve(d3.curveMonotoneX);

    svgPlot.append("path")
        .datum(stationData)
        .attr("class", "line")
        .attr("transform", "translate(" + rect.width/10 + ",0)")
        .attr("d", line)
        .style("fill", "none")
        .style("stroke", newColor)
        .style("stroke-width", "1");


    const legend = svgPlot.append('g')
      .attr('class', 'legend')
      .attr('id', station)
      .attr('transform', `translate(${rect.width*0.7},${rect.height/50 + index * 20})`)
      .style('z-index', '5')
      .on('mouseover', function () {
        // .on("mouseover", (event, d) => {
        //   onHover.html(`Station: ${event.value.station_name} <br>`)
        //          .style("left", cursor[0] + "px") // d.geometry.coordinates[0]
        //          .style("top", cursor[1] + "px")
        //          .attr("class", "tooltip")
        //          .style("visibility", "visible");

        //   createLineTagsTooltip(data, event.key, onHover);
        // })
        // .on("mouseout", function (event, d) {
        //   // Hide tooltip
        //   d3.select(".tooltip")
        //     .style("visibility", "hidden");
        // });
        let stationOnMap = svg.select(`[station_id="${station}"]`);
          
        // svg.select(`[station_id="${station}"]`)
        stationOnMap
            .style('stroke', 'black')
            .style('stroke-width', '6px')
            
        onHover.html(`Station: ${names[index]} <br>`)
                .attr('cx',stationOnMap.attr('cx'))
                .attr('cy',stationOnMap.attr('cy'))
                // .style("left", cursor[0] + "px") // d.geometry.coordinates[0]
                // .style("top", cursor[1] + "px")
                .attr("class", "tooltip")
                .style("visibility", "visible");
        createLineTagsTooltip(data, station, onHover);
        // .attr('stop-opacity', 1);

      })
      .on('mouseout', function () {
          
        svg.select(`[station_id="${station}"]`)
          .style('stroke-width', '1px')

        d3.select(".tooltip")
           .style("visibility", "hidden");

      });

    legend.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', newColor); // You may want to use different colors for each station

    legend.append('text')
      .attr('x', 20)
      .attr('y', 10)
      .attr('dy', '0.35em')
      .text(names[index]);

  });

  // Title
  svgPlot.append('text')
  .attr('x', rect.width/2)
  .attr('y', 20)
  .attr('text-anchor', 'middle')
  .style('font-size', 15)
  .text('Monthly Ridership for Stations');
  
  // X label
  svgPlot.append('text')
  .attr('x', rect.width/2)
  .attr('y', rect.height)
  .attr('text-anchor', 'middle')
  .attr('transform', 'translate(0,' + -rect.height*.02 + ')')
  .style('font-size', 12)
  .text('Month');
  
  // Y label
  svgPlot.append('text')
  .attr('text-anchor', 'middle')
  .attr('transform', 'translate('+ 0.015*rect.width + "," + rect.height/2 + ')rotate(-90)')
  .style('font-size', 12)
  .text('Ridership');

  if (!name){
    name = "Display your most recently-clicked station here!"
  }
  // Update the title in the white-box
  const headerBoxTitle = document.getElementById('header-box').querySelector('h2');
  headerBoxTitle.textContent = `CTA Ridership - ${name}`;

  // Loop through each year and add a highlight rectangle
  for (let year = startYear; year <= endYear; year++) {
    // const startOfYear = xScale(12*startYear); // Jan start
    // const endOfYear = xScale(new Date(year, 11, 31)); // Dec end
    const startOfYear = xScale(12*(year - startYear));
    const endOfYear = xScale(12*(year+1 - startYear));

    // Add a rectangle for each year
    svgPlot.append('rect')
      .attr('x', startOfYear + rect.width/10)
      .attr('width', endOfYear - startOfYear)
      .attr('y', rect.height/8)
      .attr('height', rect.height*0.75)
      .style('z-index', '3')
      .attr('class', 'highlight-rect')
      .attr('clicked', 'false')
      .style('opacity', 0) // Initially invisible
      .on('mouseover', function () {
        let element = d3.select(this);
        return element
                .transition()
                .duration(400)
                .style('opacity', 0.3);
               
      })
      .on('mouseout', function () {
        let element = d3.select(this);
        // If not clicked, opacity turns to 0
        if(element.attr('clicked') == 'false'){
          return element
               .transition()
               .duration(400)
               .style('opacity', 0);
        } else {
          return element
               .style('opacity', 0.3);
        }

      })
      .on('click', function () {
        const clickedYear = document.getElementById('year-clicked')
        clickedYear.textContent = year;

        yearToDisplay = year;

        let element = d3.select(this);
        // console.log("status: ",element.attr('clicked'));
        if (element.attr('clicked')=='true'){
          d3.select(this).attr('clicked', 'false').style('opacity', 0);
        } else {
          // Reset any other clicked rectangles
          d3.selectAll('.highlight-rect')
                .style('opacity', 0)
                .attr('clicked', 'false')
          d3.select(this)
                 .style('opacity', 0.3)
                 .attr('clicked', 'true')
        }

        updateVisualization(aggregatedData, year, svg);
      });
  }

}

// Returns array of unique stations
function getUniqueLines(data, station) {
  // console.log("getUniqueLines station_id: ",station_id);
  // Find the row corresponding to the selected station
  const stationInfo = data.find(d => d.station_id.toString() === station.toString());

  if (!stationInfo) {
      console.error('Station information not found for station_id:', station);
      return;
  }

  // Extract unique lines from the station information
  const linesSet = new Set(Object.keys(stationInfo)
  .filter(key => key !== 'station_id' && key !== 'stationame' && key !== 'month_beginning' && key !== 'Location' && key !== 'latitude' && key !== 'longitude')
  .filter(key => stationInfo[key].toString().toLowerCase() === 'true')
  );

  // Convert the Set back to an array
  return Array.from(linesSet);
}

function createLineTags(data, station) {
  // Convert the Set back to an array
  const lines = getUniqueLines(data, station);

  // Select or create the tagsContainer
  let tagsContainer = d3.select('#header-box').select('.tags-container');
  
  // If the container doesn't exist, create it
  if (tagsContainer.empty()) {
      tagsContainer = d3.select('#header-box').append('p').attr('class', 'tags-container');
  }

  // Clear existing tags
  tagsContainer.selectAll('.tag').remove();

  // Append <span> elements for each line
  const tags = tagsContainer.selectAll('.tag').data(lines);
  tags.enter().append('span').attr('class', 'tag').text(d => getTrainName(d))
      .style('background-color', d => getBackgroundColor(d)) // Apply background color based on line name
      .style('color', 'white')
      .style('z-index', '8')
      .style('border-radius', '5px')
      .style('padding', '5px')
      .style('margin-right', '5px');
}

function createLineTagsTooltip(data, station) {
  console.log("Running");
  // Convert the Set back to an array
  const lines = getUniqueLines(data, station);
  console.log("lines: ", lines);

  // Clear existing tags
  onHover.selectAll('.tag').remove();

  // Append <span> elements for each line
  const tags = onHover.selectAll('.tag').data(lines);
  tags.enter().append('span').attr('class', 'tag').text(d => getTrainName(d))
      
      .style('background-color', d => getBackgroundColor(d)) // Apply background color based on line name
      .style('color', 'white')
      .style('border-radius', '5px')
      .style('padding', '5px')
      .style('margin', '5px');
}

// Function to get background color based on line name
function getBackgroundColor(lineName) {
    // Define colors for each line name
    const colorMap = {
        'red': '#c60c30',
        'blue': '#00a1de',
        'g': '#009b3a',
        'brn': '#62361b',
        'p': '#522398',
        'pexp': '#522398',
        'y': '#f9e300',
        'pnk': '#e27ea6',
        'o': '#f9461c'
    };

    // Return the color for the given line name
    return colorMap[lineName.toLowerCase()] || 'lightgray'; // Default to gray if color not found
}

function getTrainName(colorAbbr) {
  // colorAbbr to actual color name
  const trainColorMap = {
      'red': 'Red',
      'blue': 'Blue',
      'g': 'Green',
      'brn': 'Brown',
      'p': 'Purple',
      'pexp': 'PurpleExpress',
      'y': 'Yellow',
      'pnk': 'Pink',
      'o': 'Orange'
  }

  return trainColorMap[colorAbbr.toLowerCase()] || 'lightgray';
}