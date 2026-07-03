terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-west-2"
}

resource "aws_security_group" "app" {
  name        = "school-events-sg"
  description = "School events app"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "app" {
  ami                    = "ami-05bfa4a7765f38076"
  instance_type          = "t3.small"
  key_name               = "school-events-key"
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_size = 20
  }

  tags = {
    Name = "school-events-server"
  }
}

output "public_ip" {
  value = aws_instance.app.public_ip
}
