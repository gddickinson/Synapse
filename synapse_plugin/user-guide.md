# Synapse3D User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Data Requirements](#data-requirements)
3. [Interface Overview](#interface-overview)
4. [Basic Analysis Workflow](#basic-analysis-workflow)
5. [Advanced Features](#advanced-features)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### Launching the Plugin

1. Open FLIKA
2. Go to Plugins → Synapse3D
3. Select version:
   - Synapse3D Version 2: Standard interface
   - Synapse3D Version 2 Batch: Batch processing interface

### Interface Layout

The interface consists of several key windows:
- **Main Window**: 2D visualization of localizations
- **3D View**: Interactive 3D visualization
- **Results Table**: Measurements and analysis results
- **Control Panel**: Analysis parameters and options

## Data Requirements

### File Format

The plugin accepts localization data in text (.txt) format with the following columns:
- Channel Name
- X, Y, Z coordinates (in nanometers)
- Optional: Intensity, Photons, etc.

### Channel Requirements

- Data must contain exactly two channels
- Channels should be labeled in the data file
- Common formats from superresolution microscopy software are supported

## Basic Analysis Workflow

### 1. Loading Data

1. Click "Open File" or use Ctrl+O
2. Select your localization data file
3. Verify channels are correctly loaded in the display

### 2. Setting Analysis Parameters

Access the Cluster Options window to set key parameters:

#### Basic Parameters
- **Max distance between points (eps)**: Distance threshold for DBSCAN clustering (nm)
- **Minimum number of points**: Minimum localizations to form a cluster
- **Max distance between clusters**: Maximum distance to consider clusters as associated

#### Display Parameters
- **Nanometers/pixel**: Scale factor for display
- **Centroid symbol size**: Size of cluster center markers

### 3. Running Cluster Analysis

1. Click "Get Clusters" to perform clustering analysis
2. The plugin will:
   - Perform DBSCAN clustering on each channel
   - Identify related clusters between channels
   - Calculate cluster statistics
   - Display results in the interface

### 4. Visualizing Results

Toggle between different visualization modes:
- **Toggle Noise**: Switch between all points and clustered points only
- **Toggle Centroids**: Show/hide cluster centers
- **Toggle Clusters**: Switch between different cluster views

### 5. Analyzing Results

The Results Table shows key measurements for each cluster pair:
- ROI number
- Mean distance between clusters
- Number of points per channel
- Volume per channel
- Centroid coordinates

## Advanced Features

### ROI Analysis

1. Draw ROIs around regions of interest
2. ROI measurements are automatically calculated
3. 3D view updates to show selected regions
4. Export ROI data for further analysis

### Statistical Analysis

1. Click "Cluster Analysis" to perform statistical analysis
2. The plugin compares:
   - Nearest neighbor distances
   - Random distributions
   - Cluster density
   - Spatial relationships

### Batch Processing

1. Launch Synapse3D Version 2 Batch
2. Set analysis parameters
3. Select folder containing multiple files
4. Run batch analysis
5. Results are saved automatically

### Data Export

Export options include:
1. **ROI Analysis**: Individual ROI measurements
2. **Cluster Statistics**: Overall clustering results
3. **Coordinates**: Point coordinates for each cluster
4. **Distance Measurements**: Inter-cluster distances

## Plot Options

### Color Settings

1. Open Plot Options window
2. Customize:
   - Channel 1 point color
   - Channel 2 point color
   - Centroid colors
   - Use intensity-based coloring

### 3D Viewer Controls

- **Rotate**: Left click + drag
- **Pan**: Middle click + drag
- **Zoom**: Mouse wheel
- **Reset View**: Right click → Reset View

## Troubleshooting

### Common Issues

1. **File Loading Errors**
   - Verify file format matches requirements
   - Check for special characters in headers
   - Ensure data contains two channels

2. **Clustering Issues**
   - Adjust eps parameter if clusters are too large/small
   - Increase min_samples if detecting too many small clusters
   - Check maxDistance if missing related clusters

3. **Display Problems**
   - Use "Reset Layout" to restore default window arrangement
   - Verify 3D viewer is enabled if not visible
   - Check color settings if channels are not distinct

### Performance Tips

1. **Large Datasets**
   - Enable multi-threading for faster processing
   - Use ROIs to analyze specific regions
   - Consider downsampling for initial analysis

2. **Memory Management**
   - Clear clusters before reanalysis
   - Close unused windows
   - Restart plugin for very large batch processes

## Best Practices

1. **Parameter Selection**
   - Start with default parameters
   - Adjust based on known biology
   - Validate settings on test datasets
   - Document parameters for reproducibility

2. **Analysis Workflow**
   - Begin with single-file analysis to optimize parameters
   - Validate results visually
   - Use batch processing for large datasets
   - Export results regularly

3. **Data Organization**
   - Use consistent file naming
   - Maintain separate folders for raw data and results
   - Document analysis parameters
   - Back up results regularly

## Additional Resources

- FLIKA Documentation: http://flika-org.github.io/
- Example Datasets: [Link to example data]
- Video Tutorials: [Link to tutorials]
- GitHub Repository: [Link to repo]

## Getting Help

If you encounter issues:
1. Check this user guide
2. Review the troubleshooting section
3. Check GitHub issues
4. Contact the development team

Remember to include:
- Software version
- Error messages
- Example data (if possible)
- Description of steps to reproduce the issue
